/**
 * ProfileIcons — 30 Anime & Japanese-themed SVG profile icons
 *
 * Each icon is a pure React component accepting `size` and `color` props.
 * Designed for display at 28–32 px inside a 56-px container.
 * All icons use a 32 × 32 viewBox, stroke-based, fill="none".
 */
import React from 'react';
import Svg, { Circle, Ellipse, G, Line, Path, Polygon, Polyline, Rect } from 'react-native-svg';

// ─── Type ────────────────────────────────────────────────────────────────────

export interface ProfileIconDef {
  id: string;
  label: string;
  /** Render the icon; defaults: size=28, color='#4A7C59' */
  Component: React.FC<{ size?: number; color?: string }>;
}

// ─── Helper ──────────────────────────────────────────────────────────────────

const ic = (size: number, color: string) => ({
  width: size,
  height: size,
  viewBox: '0 0 32 32',
  fill: 'none',
  stroke: color,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

// ─── 1. Straw Hat ─────────────────────────────────────────────────────────────
const StrawHat: React.FC<{ size?: number; color?: string }> = ({ size = 28, color = '#4A7C59' }) => (
  <Svg {...ic(size, color)} strokeWidth="1.6">
    <Ellipse cx="16" cy="21" rx="13" ry="4" />
    <Path d="M6 21 Q6 10 16 8 Q26 10 26 21" />
    <Path d="M7 18 Q16 16 25 18" />
    <Path d="M4 21 Q2 24 4 27" />
    <Path d="M28 21 Q30 24 28 27" />
  </Svg>
);

// ─── 2. Kunai ────────────────────────────────────────────────────────────────
const Kunai: React.FC<{ size?: number; color?: string }> = ({ size = 28, color = '#4A7C59' }) => (
  <Svg {...ic(size, color)} strokeWidth="1.6">
    <Path d="M16 2 L20 11 L16 15 L12 11 Z" />
    <Line x1="16" y1="15" x2="16" y2="21" />
    <Circle cx="16" cy="25" r="4" />
    <Line x1="14" y1="17" x2="18" y2="17" />
    <Line x1="14" y1="19" x2="18" y2="19" />
  </Svg>
);

// ─── 3. Shuriken ─────────────────────────────────────────────────────────────
const Shuriken: React.FC<{ size?: number; color?: string }> = ({ size = 28, color = '#4A7C59' }) => (
  <Svg {...ic(size, color)} strokeWidth="1.6">
    <Path d="M16 2 L19 13 L30 16 L19 19 L16 30 L13 19 L2 16 L13 13 Z" />
    <Circle cx="16" cy="16" r="3" />
  </Svg>
);

// ─── 4. Sakura ───────────────────────────────────────────────────────────────
const Sakura: React.FC<{ size?: number; color?: string }> = ({ size = 28, color = '#4A7C59' }) => (
  <Svg {...ic(size, color)} strokeWidth="1.5">
    <Path d="M16 6 C13 3 9 5 10 9 C11 13 16 14 16 14 C16 14 21 13 22 9 C23 5 19 3 16 6 Z" />
    <Path d="M22 10 C26 9 28 13 25 16 C22 19 18 17 18 17 C18 17 17 12 20 10 C21 10 21 10 22 10 Z" />
    <Path d="M20 22 C22 26 19 29 16 27 C13 25 13 21 13 21 C13 21 18 19 20 22 Z" />
    <Path d="M12 22 C10 26 13 29 16 27 C19 25 19 21 19 21 C19 21 14 19 12 22 Z" />
    <Path d="M10 10 C6 9 4 13 7 16 C10 19 14 17 14 17 C14 17 13 12 12 10 C11 10 11 10 10 10 Z" />
    <Circle cx="16" cy="16" r="2" />
  </Svg>
);

// ─── 5. Kitsune Mask ─────────────────────────────────────────────────────────
const KitsuneMask: React.FC<{ size?: number; color?: string }> = ({ size = 28, color = '#4A7C59' }) => (
  <Svg {...ic(size, color)} strokeWidth="1.5">
    <Path d="M16 3 L10 6 L5 9 Q4 20 8 25 Q12 30 16 30 Q20 30 24 25 Q28 20 27 9 L22 6 Z" />
    <Path d="M9 14 L13 12" />
    <Path d="M19 12 L23 14" />
    <Circle cx="16" cy="18" r="1" fill={color} stroke="none" />
    <Line x1="5" y1="17" x2="11" y2="18" />
    <Line x1="5" y1="19" x2="11" y2="19" />
    <Line x1="21" y1="18" x2="27" y2="17" />
    <Line x1="21" y1="19" x2="27" y2="19" />
    <Line x1="16" y1="5" x2="16" y2="9" />
    <Line x1="13" y1="6" x2="14" y2="9" />
    <Line x1="19" y1="6" x2="18" y2="9" />
  </Svg>
);

// ─── 6. Katana ───────────────────────────────────────────────────────────────
const Katana: React.FC<{ size?: number; color?: string }> = ({ size = 28, color = '#4A7C59' }) => (
  <Svg {...ic(size, color)} strokeWidth="1.6">
    <Path d="M26 3 L10 22" />
    <Path d="M26 3 L28 5 L12 24" />
    <Path d="M10 22 L8 24 L10 26 L12 24 Z" />
    <Line x1="8" y1="24" x2="4" y2="30" />
    <Line x1="7" y1="25" x2="5" y2="27" />
    <Line x1="6" y1="27" x2="4" y2="29" />
  </Svg>
);

// ─── 7. Origami Crane ────────────────────────────────────────────────────────
const OrigamiCrane: React.FC<{ size?: number; color?: string }> = ({ size = 28, color = '#4A7C59' }) => (
  <Svg {...ic(size, color)} strokeWidth="1.6">
    <Path d="M6 20 L16 12 L26 20 L16 28 Z" />
    <Path d="M6 20 L2 14 L16 12" />
    <Path d="M26 20 L30 14 L16 12" />
    <Path d="M16 12 L14 6 L17 4" />
    <Path d="M16 28 L18 31" />
  </Svg>
);

// ─── 8. Torii Gate ───────────────────────────────────────────────────────────
const ToriiGate: React.FC<{ size?: number; color?: string }> = ({ size = 28, color = '#4A7C59' }) => (
  <Svg {...ic(size, color)} strokeWidth="1.8">
    <Line x1="8" y1="30" x2="8" y2="8" />
    <Line x1="24" y1="30" x2="24" y2="8" />
    <Path d="M3 9 Q16 4 29 9" />
    <Line x1="6" y1="14" x2="26" y2="14" />
    <Line x1="5" y1="19" x2="27" y2="19" />
  </Svg>
);

// ─── 9. Sensu Fan ────────────────────────────────────────────────────────────
const Sensu: React.FC<{ size?: number; color?: string }> = ({ size = 28, color = '#4A7C59' }) => (
  <Svg {...ic(size, color)} strokeWidth="1.5">
    <Circle cx="16" cy="28" r="2" />
    <Line x1="16" y1="28" x2="4" y2="10" />
    <Line x1="16" y1="28" x2="8" y2="6" />
    <Line x1="16" y1="28" x2="13" y2="4" />
    <Line x1="16" y1="28" x2="16" y2="4" />
    <Line x1="16" y1="28" x2="19" y2="4" />
    <Line x1="16" y1="28" x2="24" y2="6" />
    <Line x1="16" y1="28" x2="28" y2="10" />
    <Path d="M4 10 Q16 2 28 10" />
  </Svg>
);

// ─── 10. Onigiri ─────────────────────────────────────────────────────────────
const Onigiri: React.FC<{ size?: number; color?: string }> = ({ size = 28, color = '#4A7C59' }) => (
  <Svg {...ic(size, color)} strokeWidth="1.6">
    <Path d="M16 4 Q22 8 27 20 Q28 26 24 28 L8 28 Q4 26 5 20 Q10 8 16 4 Z" />
    <Path d="M7 22 L25 22" />
    <Path d="M6 25 L26 25" />
    <Circle cx="16" cy="14" r="1.5" />
  </Svg>
);

// ─── 11. Ramen Bowl ──────────────────────────────────────────────────────────
const RamenBowl: React.FC<{ size?: number; color?: string }> = ({ size = 28, color = '#4A7C59' }) => (
  <Svg {...ic(size, color)} strokeWidth="1.6">
    <Path d="M5 13 Q5 28 16 28 Q27 28 27 13" />
    <Ellipse cx="16" cy="13" rx="11" ry="4" />
    <Path d="M8 16 C9 14 11 18 13 16 C15 14 17 18 19 16 C21 14 23 18 24 16" />
    <Path d="M8 20 C9 18 11 22 13 20 C15 18 17 22 19 20 C21 18 23 22 24 20" />
    <Line x1="20" y1="4" x2="15" y2="13" />
    <Line x1="23" y1="4" x2="18" y2="13" />
  </Svg>
);

// ─── 12. Daruma Doll ─────────────────────────────────────────────────────────
const DarumaDoll: React.FC<{ size?: number; color?: string }> = ({ size = 28, color = '#4A7C59' }) => (
  <Svg {...ic(size, color)} strokeWidth="1.6">
    <Circle cx="16" cy="18" r="12" />
    <Ellipse cx="16" cy="15" rx="7" ry="6" />
    <Circle cx="13" cy="14" r="2" />
    <Circle cx="19" cy="14" r="2" />
    <Path d="M11 18 Q13 20 16 18 Q19 20 21 18" />
    <Path d="M11 11 Q13 9 15 11" />
    <Path d="M17 11 Q19 9 21 11" />
  </Svg>
);

// ─── 13. Matcha Cup ──────────────────────────────────────────────────────────
const MatchaCup: React.FC<{ size?: number; color?: string }> = ({ size = 28, color = '#4A7C59' }) => (
  <Svg {...ic(size, color)} strokeWidth="1.6">
    <Path d="M7 10 Q6 24 10 26 L22 26 Q26 24 25 10 Z" />
    <Path d="M7 10 Q16 8 25 10" />
    <Path d="M5 27 Q16 30 27 27" />
    <Path d="M12 6 Q13 3 12 1" />
    <Path d="M16 6 Q17 3 16 1" />
    <Path d="M20 6 Q21 3 20 1" />
  </Svg>
);

// ─── 14. Bonsai Tree ─────────────────────────────────────────────────────────
const BonsaiTree: React.FC<{ size?: number; color?: string }> = ({ size = 28, color = '#4A7C59' }) => (
  <Svg {...ic(size, color)} strokeWidth="1.6">
    <Path d="M9 28 L10 24 L22 24 L23 28 Z" />
    <Line x1="8" y1="28" x2="24" y2="28" />
    <Path d="M16 24 Q14 18 13 13" />
    <Path d="M13 13 Q8 10 7 6" />
    <Path d="M13 13 Q18 10 20 7" />
    <Path d="M3 8 Q5 4 9 5 Q11 2 14 4 Q14 7 10 8 Z" />
    <Path d="M15 5 Q18 2 22 4 Q25 5 24 9 Q21 10 18 8 Z" />
    <Path d="M7 7 Q5 9 7 10" />
    <Path d="M22 6 Q24 8 22 10" />
  </Svg>
);

// ─── 15. Koi Fish ────────────────────────────────────────────────────────────
const KoiFish: React.FC<{ size?: number; color?: string }> = ({ size = 28, color = '#4A7C59' }) => (
  <Svg {...ic(size, color)} strokeWidth="1.6">
    <Path d="M6 16 Q6 8 16 7 Q26 8 26 16 Q26 24 16 23 Q6 22 6 16 Z" />
    <Path d="M6 16 L2 10 M6 16 L2 22" />
    <Path d="M14 7 Q15 3 18 5 Q17 7 16 7" />
    <Path d="M18 14 Q22 11 23 14" />
    <Circle cx="22" cy="14" r="1.5" />
    <Path d="M12 10 Q14 8 16 10" />
    <Path d="M16 10 Q18 8 20 10" />
    <Path d="M10 14 Q12 12 14 14" />
    <Path d="M14 14 Q16 12 18 14" />
    <Path d="M18 14 Q20 12 22 14" />
    <Path d="M11 18 Q13 16 15 18" />
    <Path d="M15 18 Q17 16 19 18" />
  </Svg>
);

// ─── 16. Kabuto ──────────────────────────────────────────────────────────────
const Kabuto: React.FC<{ size?: number; color?: string }> = ({ size = 28, color = '#4A7C59' }) => (
  <Svg {...ic(size, color)} strokeWidth="1.6">
    <Path d="M5 18 Q5 5 16 4 Q27 5 27 18" />
    <Path d="M3 18 Q3 22 7 23 L25 23 Q29 22 29 18" />
    <Path d="M5 22 Q5 25 9 26 L23 26 Q27 25 27 22" />
    <Path d="M12 4 Q16 2 20 4" />
    <Path d="M12 4 L10 0" />
    <Path d="M20 4 L22 0" />
    <Path d="M10 18 Q16 20 22 18" />
    <Circle cx="10" cy="12" r="1" fill={color} stroke="none" />
    <Circle cx="22" cy="12" r="1" fill={color} stroke="none" />
    <Circle cx="16" cy="10" r="1" fill={color} stroke="none" />
  </Svg>
);

// ─── 17. Ninja Scroll ────────────────────────────────────────────────────────
const NinjaScroll: React.FC<{ size?: number; color?: string }> = ({ size = 28, color = '#4A7C59' }) => (
  <Svg {...ic(size, color)} strokeWidth="1.6">
    <Rect x="6" y="9" width="20" height="14" rx="1" />
    <Ellipse cx="16" cy="9" rx="10" ry="3" />
    <Ellipse cx="16" cy="23" rx="10" ry="3" />
    <Line x1="10" y1="13" x2="22" y2="13" />
    <Line x1="10" y1="16" x2="22" y2="16" />
    <Line x1="10" y1="19" x2="18" y2="19" />
    <Circle cx="20" cy="19" r="2" />
  </Svg>
);

// ─── 18. Chochin Lantern ─────────────────────────────────────────────────────
const ChochinLantern: React.FC<{ size?: number; color?: string }> = ({ size = 28, color = '#4A7C59' }) => (
  <Svg {...ic(size, color)} strokeWidth="1.6">
    <Line x1="16" y1="1" x2="16" y2="5" />
    <Ellipse cx="16" cy="5" rx="4" ry="2" />
    <Path d="M12 5 Q6 8 6 16 Q6 24 12 27 L20 27 Q26 24 26 16 Q26 8 20 5 Z" />
    <Ellipse cx="16" cy="27" rx="4" ry="2" />
    <Line x1="16" y1="29" x2="16" y2="32" />
    <Line x1="15" y1="30" x2="14" y2="32" />
    <Line x1="17" y1="30" x2="18" y2="32" />
    <Path d="M7 11 Q16 9 25 11" />
    <Path d="M7 16 Q16 14 25 16" />
    <Path d="M7 21 Q16 19 25 21" />
  </Svg>
);

// ─── 19. Oni Mask ────────────────────────────────────────────────────────────
const OniMask: React.FC<{ size?: number; color?: string }> = ({ size = 28, color = '#4A7C59' }) => (
  <Svg {...ic(size, color)} strokeWidth="1.6">
    <Path d="M5 10 Q5 26 10 29 Q16 32 22 29 Q27 26 27 10 Q24 4 16 4 Q8 4 5 10 Z" />
    <Path d="M8 6 L7 1" />
    <Path d="M24 6 L25 1" />
    <Ellipse cx="11" cy="13" rx="3" ry="3" />
    <Circle cx="11" cy="13" r="1.5" fill={color} stroke="none" />
    <Ellipse cx="21" cy="13" rx="3" ry="3" />
    <Circle cx="21" cy="13" r="1.5" fill={color} stroke="none" />
    <Path d="M14 18 L16 20 L18 18" />
    <Path d="M9 23 L23 23" />
    <Path d="M12 23 L11 27" />
    <Path d="M16 23 L16 27" />
    <Path d="M20 23 L21 27" />
  </Svg>
);

// ─── 20. Taiko Drum ──────────────────────────────────────────────────────────
const TaikoDrum: React.FC<{ size?: number; color?: string }> = ({ size = 28, color = '#4A7C59' }) => (
  <Svg {...ic(size, color)} strokeWidth="1.6">
    <Rect x="4" y="11" width="24" height="10" rx="2" />
    <Ellipse cx="4" cy="16" rx="2" ry="5" />
    <Ellipse cx="28" cy="16" rx="2" ry="5" />
    <Line x1="8" y1="11" x2="6" y2="8" />
    <Line x1="12" y1="11" x2="12" y2="8" />
    <Line x1="16" y1="11" x2="16" y2="8" />
    <Line x1="20" y1="11" x2="20" y2="8" />
    <Line x1="24" y1="11" x2="26" y2="8" />
    <Line x1="8" y1="21" x2="6" y2="24" />
    <Line x1="12" y1="21" x2="12" y2="24" />
    <Line x1="16" y1="21" x2="16" y2="24" />
    <Line x1="20" y1="21" x2="20" y2="24" />
    <Line x1="24" y1="21" x2="26" y2="24" />
    <Line x1="10" y1="3" x2="14" y2="11" />
    <Line x1="22" y1="3" x2="18" y2="11" />
  </Svg>
);

// ─── 21. Maneki Neko ─────────────────────────────────────────────────────────
const ManekiNeko: React.FC<{ size?: number; color?: string }> = ({ size = 28, color = '#4A7C59' }) => (
  <Svg {...ic(size, color)} strokeWidth="1.5">
    <Path d="M8 18 Q7 28 12 29 L20 29 Q25 28 24 18 Q24 14 22 12 L10 12 Q8 14 8 18 Z" />
    <Circle cx="16" cy="10" r="7" />
    <Path d="M10 5 L9 1 L13 4" />
    <Path d="M22 5 L23 1 L19 4" />
    <Path d="M24 12 Q30 8 28 3 Q26 5 24 8" />
    <Path d="M26 5 Q28 4 29 5" />
    <Path d="M8 17 Q5 17 5 19" />
    <Circle cx="13" cy="10" r="1.5" />
    <Circle cx="19" cy="10" r="1.5" />
    <Path d="M15 13 L16 14 L17 13" />
    <Path d="M10 18 Q16 20 22 18" />
    <Circle cx="16" cy="20" r="1.5" />
  </Svg>
);

// ─── 22. Fuji Mountain ───────────────────────────────────────────────────────
const FujiMountain: React.FC<{ size?: number; color?: string }> = ({ size = 28, color = '#4A7C59' }) => (
  <Svg {...ic(size, color)} strokeWidth="1.8">
    <Path d="M2 28 L16 5 L30 28 Z" />
    <Path d="M11 16 Q16 9 21 16 Q18 14 16 14 Q14 14 11 16 Z" />
    <Line x1="1" y1="28" x2="31" y2="28" />
    <Path d="M4 24 Q8 22 12 23 Q16 21 20 23 Q24 22 28 24" />
  </Svg>
);

// ─── 23. Bamboo Stalks ───────────────────────────────────────────────────────
const BambooStalks: React.FC<{ size?: number; color?: string }> = ({ size = 28, color = '#4A7C59' }) => (
  <Svg {...ic(size, color)} strokeWidth="1.8">
    <Line x1="10" y1="2" x2="10" y2="30" />
    <Line x1="8" y1="8" x2="12" y2="8" />
    <Line x1="8" y1="15" x2="12" y2="15" />
    <Line x1="8" y1="22" x2="12" y2="22" />
    <Line x1="20" y1="2" x2="20" y2="30" />
    <Line x1="18" y1="10" x2="22" y2="10" />
    <Line x1="18" y1="18" x2="22" y2="18" />
    <Line x1="18" y1="26" x2="22" y2="26" />
    <Path d="M10 8 Q6 4 4 6" />
    <Path d="M10 15 Q14 11 16 13" />
    <Path d="M20 10 Q24 6 26 8" />
    <Path d="M20 18 Q16 14 14 16" />
  </Svg>
);

// ─── 24. Shimenawa ───────────────────────────────────────────────────────────
const Shimenawa: React.FC<{ size?: number; color?: string }> = ({ size = 28, color = '#4A7C59' }) => (
  <Svg {...ic(size, color)} strokeWidth="1.6">
    <Path d="M2 12 Q6 10 10 12 Q14 14 18 12 Q22 10 26 12 Q28 13 30 12" />
    <Path d="M2 16 Q6 14 10 16 Q14 18 18 16 Q22 14 26 16 Q28 17 30 16" />
    <Path d="M9 16 L8 20 L11 22 L8 25 L11 28" />
    <Path d="M14 16 L13 20 L16 22 L13 25 L16 28" />
    <Path d="M19 16 L20 20 L17 22 L20 25 L17 28" />
    <Circle cx="2" cy="14" r="2" />
    <Circle cx="30" cy="14" r="2" />
  </Svg>
);

// ─── 25. Akatsuki Cloud ──────────────────────────────────────────────────────
const AkatsukiCloud: React.FC<{ size?: number; color?: string }> = ({ size = 28, color = '#4A7C59' }) => (
  <Svg {...ic(size, color)} strokeWidth="1.6">
    <Path d="M6 16 Q5 10 9 9 Q10 5 14 6 Q16 3 19 5 Q23 4 24 8 Q28 8 28 13 Q30 15 28 18 L4 18 Q2 15 6 16 Z" />
    <Path d="M4 18 L7 26 L10 18 L13 26 L16 18 L19 26 L22 18 L25 26 L28 18" />
  </Svg>
);

// ─── 26. Tomoe ───────────────────────────────────────────────────────────────
const Tomoe: React.FC<{ size?: number; color?: string }> = ({ size = 28, color = '#4A7C59' }) => (
  <Svg {...ic(size, color)} strokeWidth="1.5">
    <Circle cx="16" cy="16" r="13" />
    <Path d="M16 5 Q20 5 22 9 Q24 13 20 15 Q16 17 16 13 Q16 9 16 5 Z" />
    <Path d="M24 24 Q21 28 17 27 Q13 26 13 22 Q13 18 17 18 Q21 18 24 24 Z" />
    <Path d="M8 24 Q5 20 7 16 Q9 12 13 13 Q17 14 16 18 Q15 22 8 24 Z" />
    <Circle cx="16" cy="16" r="2" />
  </Svg>
);

// ─── 27. Lotus Flower ────────────────────────────────────────────────────────
const LotusFlower: React.FC<{ size?: number; color?: string }> = ({ size = 28, color = '#4A7C59' }) => (
  <Svg {...ic(size, color)} strokeWidth="1.5">
    <Path d="M16 26 Q9 24 8 16 Q12 10 16 12" />
    <Path d="M16 26 Q23 24 24 16 Q20 10 16 12" />
    <Path d="M16 12 Q10 6 10 2 Q13 4 16 8 Q19 4 22 2 Q22 6 16 12" />
    <Path d="M16 22 Q12 20 12 16 Q14 12 16 14" />
    <Path d="M16 22 Q20 20 20 16 Q18 12 16 14" />
    <Circle cx="16" cy="17" r="3" />
    <Line x1="16" y1="26" x2="16" y2="30" />
    <Path d="M16 29 Q10 28 9 31" />
    <Path d="M16 29 Q22 28 23 31" />
  </Svg>
);

// ─── 28. Uchiwa — Round Fan ───────────────────────────────────────────────────
const Uchiwa: React.FC<{ size?: number; color?: string }> = ({ size = 28, color = '#4A7C59' }) => (
  <Svg {...ic(size, color)} strokeWidth="1.6">
    <Circle cx="16" cy="13" r="11" />
    <Line x1="16" y1="24" x2="16" y2="31" />
    <Line x1="14" y1="24" x2="14" y2="30" />
    <Line x1="18" y1="24" x2="18" y2="30" />
    <Line x1="16" y1="13" x2="6" y2="6" />
    <Line x1="16" y1="13" x2="10" y2="3" />
    <Line x1="16" y1="13" x2="16" y2="2" />
    <Line x1="16" y1="13" x2="22" y2="3" />
    <Line x1="16" y1="13" x2="26" y2="6" />
    <Line x1="16" y1="13" x2="27" y2="13" />
    <Line x1="16" y1="13" x2="5" y2="13" />
    <Line x1="16" y1="13" x2="26" y2="20" />
    <Line x1="16" y1="13" x2="6" y2="20" />
  </Svg>
);

// ─── 29. Kendo Mask ──────────────────────────────────────────────────────────
const KendoMask: React.FC<{ size?: number; color?: string }> = ({ size = 28, color = '#4A7C59' }) => (
  <Svg {...ic(size, color)} strokeWidth="1.5">
    <Path d="M6 14 Q6 4 16 3 Q26 4 26 14" />
    <Rect x="6" y="14" width="20" height="13" rx="1" />
    <Line x1="6" y1="17" x2="26" y2="17" />
    <Line x1="6" y1="20" x2="26" y2="20" />
    <Line x1="6" y1="23" x2="26" y2="23" />
    <Line x1="10" y1="14" x2="10" y2="27" />
    <Line x1="14" y1="14" x2="14" y2="27" />
    <Line x1="18" y1="14" x2="18" y2="27" />
    <Line x1="22" y1="14" x2="22" y2="27" />
    <Path d="M6 14 L2 16 L2 24 L6 27" />
    <Path d="M26 14 L30 16 L30 24 L26 27" />
    <Path d="M5 27 Q16 30 27 27" />
  </Svg>
);

// ─── 30. Yen Coin ─────────────────────────────────────────────────────────────
const YenCoin: React.FC<{ size?: number; color?: string }> = ({ size = 28, color = '#4A7C59' }) => (
  <Svg {...ic(size, color)} strokeWidth="1.6">
    <Circle cx="16" cy="16" r="13" />
    <Circle cx="16" cy="16" r="10" />
    <Line x1="12" y1="10" x2="16" y2="16" />
    <Line x1="20" y1="10" x2="16" y2="16" />
    <Line x1="16" y1="16" x2="16" y2="23" />
    <Line x1="12" y1="18" x2="20" y2="18" />
    <Line x1="12" y1="20" x2="20" y2="20" />
  </Svg>
);

// ─── Registry ─────────────────────────────────────────────────────────────────

export const PROFILE_ICON_DEFS: ProfileIconDef[] = [
  { id: 'strawhat',  label: 'Straw Hat',      Component: StrawHat },
  { id: 'kunai',     label: 'Kunai',           Component: Kunai },
  { id: 'shuriken',  label: 'Shuriken',        Component: Shuriken },
  { id: 'sakura',    label: 'Sakura',          Component: Sakura },
  { id: 'kitsune',   label: 'Kitsune Mask',    Component: KitsuneMask },
  { id: 'katana',    label: 'Katana',          Component: Katana },
  { id: 'crane',     label: 'Origami Crane',   Component: OrigamiCrane },
  { id: 'torii',     label: 'Torii Gate',      Component: ToriiGate },
  { id: 'sensu',     label: 'Sensu Fan',       Component: Sensu },
  { id: 'onigiri',   label: 'Onigiri',         Component: Onigiri },
  { id: 'ramen',     label: 'Ramen Bowl',      Component: RamenBowl },
  { id: 'daruma',    label: 'Daruma Doll',     Component: DarumaDoll },
  { id: 'matcha',    label: 'Matcha Cup',      Component: MatchaCup },
  { id: 'bonsai',    label: 'Bonsai Tree',     Component: BonsaiTree },
  { id: 'koi',       label: 'Koi Fish',        Component: KoiFish },
  { id: 'kabuto',    label: 'Kabuto',          Component: Kabuto },
  { id: 'scroll',    label: 'Ninja Scroll',    Component: NinjaScroll },
  { id: 'lantern',   label: 'Chochin Lantern', Component: ChochinLantern },
  { id: 'oni',       label: 'Oni Mask',        Component: OniMask },
  { id: 'taiko',     label: 'Taiko Drum',      Component: TaikoDrum },
  { id: 'neko',      label: 'Maneki Neko',     Component: ManekiNeko },
  { id: 'fuji',      label: 'Fuji Mountain',   Component: FujiMountain },
  { id: 'bamboo',    label: 'Bamboo',          Component: BambooStalks },
  { id: 'shimenawa', label: 'Shimenawa',       Component: Shimenawa },
  { id: 'cloud',     label: 'Akatsuki Cloud',  Component: AkatsukiCloud },
  { id: 'tomoe',     label: 'Tomoe',           Component: Tomoe },
  { id: 'lotus',     label: 'Lotus Flower',    Component: LotusFlower },
  { id: 'uchiwa',    label: 'Uchiwa Fan',      Component: Uchiwa },
  { id: 'kendo',     label: 'Kendo Mask',      Component: KendoMask },
  { id: 'yen',       label: 'Yen Coin',        Component: YenCoin },
];

/** Quick lookup by icon ID */
export const getProfileIconById = (id: string): ProfileIconDef | undefined =>
  PROFILE_ICON_DEFS.find(d => d.id === id);

/** Render a profile icon inline — safe fallback to first icon if id unknown */
export const ProfileIconRenderer: React.FC<{
  iconId: string;
  size?: number;
  color?: string;
}> = ({ iconId, size = 28, color = '#4A7C59' }) => {
  const def = getProfileIconById(iconId) ?? PROFILE_ICON_DEFS[0];
  return <def.Component size={size} color={color} />;
};
