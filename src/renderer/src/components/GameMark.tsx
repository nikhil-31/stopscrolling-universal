import { gameAssetUrl } from "@shared/game-assets";

export function CategoryMark({ assetId, color }: { assetId?: string; color: string }) {
  if (!assetId) {
    return <span className="category-swatch" style={{ ["--swatch" as string]: color }} />;
  }
  return <img className="game-asset" alt="" src={gameAssetUrl(assetId)} />;
}

export function GameMark({ platform }: { platform: "riot" | "steam" }) {
  const riot = platform === "riot";
  return (
    <svg className="game-mark" viewBox="0 0 20 20" aria-hidden="true" data-testid={`settings-${platform}-mark`}>
      <rect width="20" height="20" rx="5" fill={riot ? "#d13639" : "#1b2838"} />
      <text x="10" y="14" textAnchor="middle" fill="#fff" fontSize="11" fontFamily="ui-sans-serif, sans-serif" fontWeight="700">
        {riot ? "R" : "S"}
      </text>
    </svg>
  );
}
