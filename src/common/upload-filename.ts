/**
 * multer(busboy)는 multipart 파일명을 latin1 로 읽어서, 한글 파일명이
 * "ê°ì¬1í¸.jpg" 처럼 깨진다. UTF-8 로 다시 해석해 원래 이름을 돌려준다.
 * 이미 올바른 유니코드이거나 UTF-8 로 해석되지 않으면 그대로 둔다.
 */
export function decodeUploadFilename(name: string): string {
  if (!name || /[Ā-￿]/.test(name)) {
    return name;
  }
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('�') ? name : decoded;
}
