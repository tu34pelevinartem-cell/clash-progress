# Artwork for the TH19 preview

These unmodified PNGs are Clash of Clans game artwork published with the Clash Champs guide of 16 November 2026:

https://www.clashchamps.com/2026/11/16/town-hall-19-update-new-defenses-spiky-tower-firecracker-tower-more/

| Local file in `release-assets/` | Published image URL |
| --- | --- |
| town-hall-19.png | https://www.clashchamps.com/wp-content/uploads/2026/11/TH19_Face_3Points_001-1024x1024.png |
| spiky-tower.png | https://www.clashchamps.com/wp-content/uploads/2026/11/Coc_Spikytower_Market_Comp_001-1024x1024.png |
| firecracker-tower.png | https://www.clashchamps.com/wp-content/uploads/2026/11/FireCracker_Render_Posing_B_0002-1-1024x1024.png |
| squad-barracks.png | https://www.clashchamps.com/wp-content/uploads/2026/11/squad_barracks_lvl12.png |
| heroic-spell.png | https://www.clashchamps.com/wp-content/uploads/2026/11/Heroic_Spell-1.png |

The new defense illustrations are promotional artwork; they are used in the preview catalogue and do not assert an exported player's building level. The TH19 image is used only for Town Hall level 19. Existing current-level artwork remains from the integrity-pinned data package.

The released build also includes 30 unmodified WebP images from [ClashKing Assets 2.5.0](https://github.com/ClashKingInc/ClashKingAssets/tree/fa40345986d5c862480e6fa34aa5100ab8eee345/assets): two levels of each new defense, all twelve Squad Barracks levels, wall level 20, the Heroic Spell and twelve squad icons. `data/release-artwork.json` pins each source path, byte size and Git blob hash to that exact commit. The builder verifies the image bytes and packages them with the site. Visitors load these images from the same site, without contacting the source host.

Building models are mapped to their actual level. A level 1 Squad Barracks does not use the level 12 promotional image. Spells and squad icons are generic. The Guardian Shrine remains a placeholder until an appropriate image is available.

Clash of Clans and its game artwork belong to Supercell. This is an unofficial fan project. The package license in `DATA-LICENSE.txt` applies to that package, not a grant of ownership of these game images. See Supercell's [Fan Content Policy](https://supercell.com/en/fan-content-policy/).
