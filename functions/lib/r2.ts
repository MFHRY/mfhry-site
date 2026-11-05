// R2 绑定兼容：不同项目可能命名为 R2 / R2_BUCKET / VIDEOS / MEDIA 等。
export function r2Bucket(env: any): any {
  const names = ['R2', 'R2_BUCKET', 'VIDEOS', 'VIDEO_BUCKET', 'MEDIA', 'MEDIA_BUCKET', 'BUCKET', 'MFH_R2', 'MY_BUCKET'];
  for (const name of names) {
    const b = env?.[name];
    if (b && typeof b.put === 'function' && typeof b.get === 'function') return b;
  }
  return null;
}
