-- AlterEnum: delivery workflow statuses for 배달 orders
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'SHIPPING';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'RECEIVED';
