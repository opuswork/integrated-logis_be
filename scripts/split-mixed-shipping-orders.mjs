/**
 * 택배 + 상차(배달)가 한 건에 섞여 들어간 기존 주문을 배송 줄 단위로 쪼갠다.
 *
 * 대상: notes 에 `배송상세:<base64url>` 이 있고 줄이 2개 이상인 주문.
 * 결과: ORD-2026-567480 → ORD-2026-567480-1(택배), ORD-2026-567480-2(상차)
 *   - 첫 줄은 원본 Order 행을 재사용(주문번호에 -1 붙임)
 *   - 나머지 줄은 Order 행을 새로 만들고, 원본의 진행상태/체크리스트 값을 복사
 *   - OrderItem / Shipment / GreetingForm 을 각 줄에 맞게 재배치
 *
 * Usage (from be/):
 *   SPLIT_ORDERS_CONFIRM=YES node scripts/split-mixed-shipping-orders.mjs
 *   # 미리보기(쓰기 없음)
 *   node scripts/split-mixed-shipping-orders.mjs
 */
import "dotenv/config";
import pg from "pg";

function buildPoolConfig(connectionString) {
  if (/@(localhost|127\.0\.0\.1)(:|\/)/.test(connectionString)) {
    return { connectionString };
  }
  try {
    const url = new URL(connectionString);
    url.searchParams.delete("sslmode");
    url.searchParams.delete("uselibpqcompat");
    return {
      connectionString: url.toString(),
      ssl: { rejectUnauthorized: false },
    };
  } catch {
    return { connectionString, ssl: { rejectUnauthorized: false } };
  }
}

function maskDbUrl(connectionString) {
  try {
    const url = new URL(connectionString);
    if (url.password) url.password = "***";
    return url.toString();
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

/* ---------- notes 파싱/조립 (fe/src/lib/order-notes.ts 와 동일 규칙) ---------- */

const CONTACT_MODE_LABEL = { address: "주소", email: "이메일", fax: "팩스" };

function parseOrderNoteField(notes, field) {
  if (!notes) return "";
  const pattern = new RegExp(`${field}:([^/]+)`);
  return pattern.exec(notes)?.[1]?.trim() ?? "";
}

function fromBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  return Buffer.from(padded, "base64");
}

function toBase64Url(buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function parseLineShipments(notes) {
  const raw = parseOrderNoteField(notes, "배송상세");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(fromBase64Url(raw.trim()).toString("utf8"));
    if (!Array.isArray(parsed.lines) || parsed.lines.length === 0) return null;
    return parsed.lines;
  } catch {
    return null;
  }
}

function encodeLineShipments(lines) {
  return `배송상세:${toBase64Url(
    Buffer.from(JSON.stringify({ v: 1, lines }), "utf8"),
  )}`;
}

function joinAddress(base, detail) {
  return [(base ?? "").trim(), (detail ?? "").trim()].filter(Boolean).join(" ");
}

/** 원본 notes 의 공통 부분 + 이 줄의 배송정보로 notes 한 벌을 다시 만든다. */
function buildNotesForLine(originalNotes, line) {
  const ship = line.ship;
  const isDelivery = ship.kind === "delivery";
  const segments = (originalNotes ?? "").split(" / ").map((s) => s.trim());

  // 주문 공통 세그먼트는 원본 그대로 가져온다.
  const keepPrefixes = [
    "주문자:",
    "연락처:",
    "주문일자:",
    "중앙:",
    "주문작업지역:",
    "지부매장:",
    "인사장종류:",
  ];
  const common = segments.filter((segment) =>
    keepPrefixes.some((prefix) => segment.startsWith(prefix)),
  );
  // 인사장 상세 세그먼트(인사장번호/인사장내용 등)도 유지
  const greetingSegments = segments.filter(
    (segment) =>
      segment.startsWith("인사장번호:") ||
      segment.startsWith("인사장본인:") ||
      segment.startsWith("명함:") ||
      segment.startsWith("인사장특이사항:") ||
      segment.startsWith("인사장크기:") ||
      segment.startsWith("인사장수령처:"),
  );

  const ordered = [];
  const pick = (prefix) => common.find((s) => s.startsWith(prefix)) ?? null;
  for (const prefix of ["주문자:", "연락처:", "주문일자:", "중앙:"]) {
    const found = pick(prefix);
    if (found) ordered.push(found);
  }

  const recipientAddress = joinAddress(
    ship.recipientAddress,
    ship.recipientAddressDetail,
  );
  const senderAddress = joinAddress(ship.senderAddress, ship.senderAddressDetail);
  const contactMode = isDelivery ? "address" : (ship.contactMode ?? "address");

  if (isDelivery) {
    ordered.push(`배달업체명:${(ship.companyName ?? "").trim()}`);
    ordered.push(
      `배달일:${ship.deliveryDate ?? ""} ${ship.deliveryAmPm ?? ""} ${ship.deliveryTime ?? ""}`,
    );
    ordered.push(
      `받는분:${(ship.recipientName ?? "").trim()} / ${(ship.recipientPhone ?? "").trim()} / ${
        recipientAddress || "-"
      }`,
    );
  } else {
    ordered.push(`택배업체명:${(ship.companyName ?? "").trim()}`);
    ordered.push(`택배발송일:${ship.parcelShipDate ?? ""}`);
    ordered.push(
      `보내는사람:${(ship.senderName ?? "").trim()} / ${(ship.senderPhone ?? "").trim()} / ${senderAddress}`,
    );
    if ((ship.senderAddressDetail ?? "").trim()) {
      ordered.push(`보내는분상세주소:${ship.senderAddressDetail.trim()}`);
    }
  }

  ordered.push(`수취연락:${CONTACT_MODE_LABEL[contactMode] ?? "주소"}`);
  if (contactMode === "address" && recipientAddress) {
    ordered.push(`받는분주소:${recipientAddress}`);
  }
  if (contactMode === "address" && (ship.recipientAddressDetail ?? "").trim()) {
    ordered.push(`받는분상세주소:${ship.recipientAddressDetail.trim()}`);
  }

  for (const prefix of ["주문작업지역:", "지부매장:", "인사장종류:"]) {
    const found = pick(prefix);
    if (found) ordered.push(found);
  }
  ordered.push(...greetingSegments);
  ordered.push(
    `[${isDelivery ? "배달" : "택배"}] ${line.product} ${line.qty}개${
      line.note ? `(${line.note})` : ""
    }`,
  );
  ordered.push(encodeLineShipments([line]));

  return ordered.filter(Boolean).join(" / ");
}

function estimatedWindowForLine(ship) {
  if (ship.kind === "delivery") {
    if (!ship.deliveryDate) return null;
    const time = toTwentyFourHour(ship.deliveryAmPm, ship.deliveryTime);
    return `${ship.deliveryDate}T${time ?? "09:00"}:00.000Z`;
  }
  if (!ship.parcelShipDate) return null;
  return `${ship.parcelShipDate}T09:00:00.000Z`;
}

function toTwentyFourHour(ampm, hhmm) {
  const match = /^(\d{1,2}):(\d{2})$/.exec((hhmm ?? "").trim());
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2];
  if (hour < 1 || hour > 12) return null;
  if (ampm === "오전") {
    if (hour === 12) hour = 0;
  } else if (ampm === "오후") {
    if (hour !== 12) hour += 12;
  }
  return `${String(hour).padStart(2, "0")}:${minute}`;
}

/* --------------------------------- main --------------------------------- */

const COPIED_ORDER_COLUMNS = [
  "status",
  "notes",
  '"extra_note"',
  '"factoryAlert"',
  '"storeRegion"',
  '"packaging_worker"',
  '"orderConfirmedAt"',
  '"orderConfirmedBy"',
  '"paymentDone"',
  '"paymentAuthor"',
  '"greetingDone"',
  '"slipDone"',
  '"slipAuthor"',
  '"readyForShipment"',
  '"requestedShipDate"',
  '"packDept"',
  '"packDate"',
  '"packPt"',
  '"storagePlace"',
  '"packDone"',
  '"releaseDone"',
  '"releaseDoneAt"',
  '"finalCompleteDone"',
  '"finalConfirmDone"',
  '"userId"',
];

async function main() {
  const apply = process.env.SPLIT_ORDERS_CONFIRM === "YES";
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  console.log("Target DB:", maskDbUrl(connectionString));
  console.log(apply ? "MODE: APPLY" : "MODE: DRY RUN (쓰기 없음)");

  const pool = new pg.Pool(buildPoolConfig(connectionString));
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows: orders } = await client.query(
      `SELECT id, "orderNumber", notes, "totalAmount", status
         FROM "Order"
        WHERE notes LIKE '%배송상세:%'
          AND status <> 'CANCELLED'
        ORDER BY id`,
    );

    let splitCount = 0;
    let createdCount = 0;

    for (const order of orders) {
      const lines = parseLineShipments(order.notes);
      if (!lines || lines.length < 2) continue;

      // 이미 -N 으로 쪼개진 주문은 건너뛴다
      if (/-\d+$/.test(order.orderNumber) && lines.length === 1) continue;

      const { rows: items } = await client.query(
        `SELECT id, "productName", quantity, price
           FROM "OrderItem" WHERE "orderId" = $1 ORDER BY id`,
        [order.id],
      );
      const { rows: greetings } = await client.query(
        `SELECT id, "productName" FROM "greeting_form" WHERE "orderId" = $1`,
        [order.id],
      );

      console.log(
        `\n${order.orderNumber} (id=${order.id}) → ${lines.length}건으로 분할`,
      );

      const remainingItems = [...items];
      const usedGreetings = new Set();

      for (const [index, line] of lines.entries()) {
        const suffix = `${order.orderNumber}-${index + 1}`;
        const isDelivery = line.ship.kind === "delivery";
        const lineTotal = (line.qty ?? 0) * (line.unitPrice ?? 0);
        const notes = buildNotesForLine(order.notes, line);

        // 이 줄에 해당하는 OrderItem 찾기 (품명+수량 우선)
        let itemIndex = remainingItems.findIndex(
          (item) =>
            item.productName === line.product && item.quantity === line.qty,
        );
        if (itemIndex < 0) {
          itemIndex = remainingItems.findIndex(
            (item) => item.productName === line.product,
          );
        }
        const matchedItem =
          itemIndex >= 0 ? remainingItems.splice(itemIndex, 1)[0] : null;

        console.log(
          `  ${suffix}  ${isDelivery ? "상차" : "택배"}  ${line.product} ${line.qty}개  ${lineTotal.toLocaleString()}원` +
            (matchedItem ? "" : "  (OrderItem 매칭 실패 → 새로 생성)"),
        );

        if (!apply) {
          createdCount += index === 0 ? 0 : 1;
          continue;
        }

        let targetOrderId;
        if (index === 0) {
          // 첫 줄은 원본 행을 재사용
          targetOrderId = order.id;
          await client.query(
            `UPDATE "Order"
                SET "orderNumber" = $1, notes = $2, "totalAmount" = $3
              WHERE id = $4`,
            [suffix, notes, lineTotal, order.id],
          );
        } else {
          const columns = COPIED_ORDER_COLUMNS.join(", ");
          const { rows: inserted } = await client.query(
            `INSERT INTO "Order" ("orderNumber", ${columns}, "createdAt", "updatedAt")
             SELECT $1, ${columns}, "createdAt", NOW()
               FROM "Order" WHERE id = $2
             RETURNING id`,
            [suffix, order.id],
          );
          targetOrderId = inserted[0].id;
          createdCount += 1;
          await client.query(
            `UPDATE "Order" SET notes = $1, "totalAmount" = $2 WHERE id = $3`,
            [notes, lineTotal, targetOrderId],
          );
        }

        // OrderItem 재배치
        if (matchedItem) {
          await client.query(
            `UPDATE "OrderItem"
                SET "orderId" = $1, quantity = $2, price = $3
              WHERE id = $4`,
            [targetOrderId, line.qty, line.unitPrice ?? matchedItem.price, matchedItem.id],
          );
        } else {
          await client.query(
            `INSERT INTO "OrderItem" ("productName", quantity, price, "orderId")
             VALUES ($1, $2, $3, $4)`,
            [line.product, line.qty, line.unitPrice ?? 0, targetOrderId],
          );
        }

        // Shipment 재설정 (INSERT 로 만들어진 주문은 shipment 가 없다)
        const estimatedWindow = estimatedWindowForLine(line.ship);
        const carrier = (line.ship.companyName ?? "").trim();
        const deliveryAddress = isDelivery
          ? joinAddress(
              line.ship.recipientAddress,
              line.ship.recipientAddressDetail,
            )
          : joinAddress(line.ship.senderAddress, line.ship.senderAddressDetail);
        const { rowCount } = await client.query(
          `UPDATE "Shipment"
              SET carrier = $1, "deliveryAddress" = $2, "estimatedWindow" = $3
            WHERE "orderId" = $4`,
          [carrier, deliveryAddress, estimatedWindow, targetOrderId],
        );
        if (rowCount === 0) {
          await client.query(
            `INSERT INTO "Shipment"
               ("fulfillmentType", carrier, "deliveryAddress", "estimatedWindow", "orderId")
             VALUES ('PARCEL', $1, $2, $3, $4)`,
            [carrier, deliveryAddress, estimatedWindow, targetOrderId],
          );
        }

        // 인사장(선물세트에만 있음)은 같은 품명의 첫 주문에만 붙인다
        const greeting = greetings.find(
          (row) =>
            row.productName === line.product && !usedGreetings.has(row.id),
        );
        if (greeting) {
          usedGreetings.add(greeting.id);
          await client.query(
            `UPDATE "greeting_form" SET "orderId" = $1 WHERE id = $2`,
            [targetOrderId, greeting.id],
          );
        }
      }

      splitCount += 1;
    }

    if (apply) {
      await client.query("COMMIT");
      console.log(
        `\n완료: 주문 ${splitCount}건을 쪼갰고 ${createdCount}건을 새로 만들었습니다.`,
      );
    } else {
      await client.query("ROLLBACK");
      console.log(
        `\n미리보기: 주문 ${splitCount}건이 대상이며 ${createdCount}건이 새로 생성됩니다.`,
      );
      console.log("적용하려면 SPLIT_ORDERS_CONFIRM=YES 로 다시 실행하세요.");
    }
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
