// 五线谱字形（谱号、临时记号、符头），供 Staff 与 MeasuredStaff 共用。

// ───── 字形 ─────

export function TrebleClef({ x, gy }: { x: number; gy: number }) {
  // gy 为第二线（G 线）的 y
  const p = (dx: number, dy: number) => `${x + dx} ${gy + dy}`;
  const d = [
    `M${p(2, 4)}`,
    `C${p(-2, 6)} ${p(-5, 3)} ${p(-4, 0)}`,
    `C${p(-4, -5)} ${p(-1, -7)} ${p(2, -7)}`,
    `C${p(6, -7)} ${p(9, -2)} ${p(8, 2)}`,
    `C${p(8, 7)} ${p(4, 10)} ${p(0, 10)}`,
    `C${p(-5, 10)} ${p(-9, 6)} ${p(-9, 1)}`,
    `C${p(-9, -6)} ${p(1, -11)} ${p(3, -16)}`,
    `C${p(6, -21)} ${p(8, -27)} ${p(5, -30)}`,
    `C${p(3, -33)} ${p(-1, -30)} ${p(-1, -24)}`,
    `C${p(-1, -10)} ${p(3, 10)} ${p(3, 22)}`,
    `C${p(3, 27)} ${p(-3, 27)} ${p(-4, 23)}`,
  ].join(' ');
  return (
    <g>
      <path d={d} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x - 2.4} cy={gy + 22.5} r={2.6} />
    </g>
  );
}

export function BassClef({ x, fy }: { x: number; fy: number }) {
  // fy 为第四线（F 线）的 y
  const p = (dx: number, dy: number) => `${x + dx} ${fy + dy}`;
  return (
    <g>
      <circle cx={x - 4} cy={fy + 0.5} r={3.4} />
      <path
        d={`M${p(-7, -0.5)} C${p(-6, -9)} ${p(7, -10)} ${p(8, -1)} C${p(9, 7)} ${p(2, 15)} ${p(-8, 21)}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
      />
      <circle cx={x + 13} cy={fy - 4.5} r={1.7} />
      <circle cx={x + 13} cy={fy + 4.5} r={1.7} />
    </g>
  );
}

/** 临时记号字形，(x, y) 为中心。 */
export function Accidental({ alt, x, y }: { alt: number; x: number; y: number }) {
  const line = (x1: number, y1: number, x2: number, y2: number, w = 1.3) => (
    <line x1={x + x1} y1={y + y1} x2={x + x2} y2={y + y2} stroke="currentColor" strokeWidth={w} />
  );
  const flat = (dx: number) => (
    <g key={dx}>
      {line(dx - 2.5, -13, dx - 2.5, 4.5)}
      <path
        d={`M${x + dx - 2.5} ${y + 4.5} C${x + dx + 6} ${y - 1} ${x + dx + 3.5} ${y - 6.5} ${x + dx - 2.5} ${y - 1.5}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
      />
    </g>
  );
  if (alt === 1)
    return (
      <g>
        {line(-1.8, -8, -1.8, 10)}
        {line(1.8, -10, 1.8, 8)}
        {line(-4.2, -1.6, 4.2, -4.4, 2.6)}
        {line(-4.2, 4.4, 4.2, 1.6, 2.6)}
      </g>
    );
  if (alt === -1) return flat(0);
  if (alt === -2) return <g>{[flat(-3), flat(3)]}</g>;
  if (alt === 2)
    return (
      <g>
        {line(-3.2, -3.2, 3.2, 3.2, 1.8)}
        {line(-3.2, 3.2, 3.2, -3.2, 1.8)}
      </g>
    );
  // 还原号
  return (
    <g>
      {line(-2.2, -10, -2.2, 3.5)}
      {line(2.2, -3.5, 2.2, 10)}
      {line(-2.2, -1.2, 2.2, -3, 2.6)}
      {line(-2.2, 4.4, 2.2, 2.6, 2.6)}
    </g>
  );
}

export function Notehead({ x, y, whole, half = false }: { x: number; y: number; whole: boolean; half?: boolean }) {
  if (half) {
    // 二分音符：倾斜的空心符头（内椭圆比外椭圆更斜、更扁）
    const t = (15 * Math.PI) / 180;
    const [rx, ry] = [4.7, 1.9];
    const [cx, cy] = [rx * Math.cos(t), rx * Math.sin(t)];
    const d =
      `M${x - 6} ${y} a6 4.3 0 1 0 12 0 a6 4.3 0 1 0 -12 0Z ` +
      `M${x - cx} ${y + cy} a${rx} ${ry} -15 1 0 ${2 * cx} ${-2 * cy} a${rx} ${ry} -15 1 0 ${-2 * cx} ${2 * cy}Z`;
    return <path d={d} fillRule="evenodd" transform={`rotate(-20 ${x} ${y})`} />;
  }
  if (!whole) return <ellipse cx={x} cy={y} rx={6} ry={4.3} transform={`rotate(-20 ${x} ${y})`} />;
  // 全音符：外椭圆减去倾斜的内椭圆（evenodd 镂空）
  const t = (55 * Math.PI) / 180;
  const [rx, ry] = [3.6, 2.3];
  const [cx, cy] = [rx * Math.cos(t), rx * Math.sin(t)];
  const d =
    `M${x - 7.2} ${y} a7.2 4.8 0 1 0 14.4 0 a7.2 4.8 0 1 0 -14.4 0Z ` +
    `M${x - cx} ${y - cy} a${rx} ${ry} 55 1 0 ${2 * cx} ${2 * cy} a${rx} ${ry} 55 1 0 ${-2 * cx} ${-2 * cy}Z`;
  return <path d={d} fillRule="evenodd" />;
}

