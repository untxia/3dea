import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/* Le rayon de référence : les mêmes pièces que celles affichées dans la
   bibliothèque, mais devenues des lignes en base qu'on peut tagger,
   annoter et enrichir. */
const CATALOGUE = [
  { title: 'Engrenage droit',       category: 'mecanique', tags: ['mecanique', 'pla'],
    summary: "Denture droite avec moyeu et allègements. À plat, sans support, 4 périmètres pour la tenue des dents." },
  { title: 'Vase spiralé',          category: 'deco',      tags: ['deco', 'mode-vase'],
    summary: "Paroi unique, zéro remplissage. Buse 0,6 mm et couche 0,3 mm pour un rendu net." },
  { title: 'Support casque',        category: 'fixation',  tags: ['fixation', 'petg'],
    summary: "Berceau large pour ne pas marquer l'arceau. Supports sous le crochet uniquement." },
  { title: 'Bac modulaire',         category: 'rangement', tags: ['rangement', 'gridfinity'],
    summary: "Standard modulaire à emboîter. Parois fines, 10 % de remplissage, aucun support." },
  { title: 'Support téléphone',     category: 'rangement', tags: ['bureau'],
    summary: "Angle de lecture d'environ 60°, passage de câble sous la base." },
  { title: 'Crochet mural',         category: 'fixation',  tags: ['fixation', 'petg'],
    summary: "Deux points de vis, courbe fermée contre le décrochage." },
  { title: 'Cache-pot à réserve',   category: 'deco',      tags: ['deco', 'petg'],
    summary: "Double paroi avec réserve d'eau. PETG obligatoire au contact permanent." },
  { title: 'Clip de câble',         category: 'atelier',   tags: ['atelier'],
    summary: "Imprimé par lot. Ouverture légèrement inférieure au diamètre du câble." },
  { title: 'Équerre de fixation',   category: 'fixation',  tags: ['fixation'],
    summary: "Nervure de renfort dans l'angle. Orientée à 45°, les couches ne travaillent plus en pelage." },
  { title: 'Tige filetée',          category: 'mecanique', tags: ['mecanique'],
    summary: "Filet trapézoïdal, plus tolérant que le métrique. Prévoir 0,3 mm de jeu." },
  { title: 'Tour de température',   category: 'test',      tags: ['calibration'],
    summary: "Chaque étage change de température via le G-code. Passage obligé avec une bobine inconnue." },
  { title: 'Bateau de calibration', category: 'test',      tags: ['calibration'],
    summary: "Surplombs, ponts, cheminée fine et coque courbe dans une pièce de 6 cm." },
  { title: 'Pion de jeu',           category: 'deco',      tags: ['deco', 'resine'],
    summary: "Forme tournée, idéale pour tester une buse de 0,2 mm." },
  { title: 'Support de bobine',     category: 'atelier',   tags: ['atelier', 'petg'],
    summary: "Axe sur roulements 608. 40 % de remplissage minimum, la pièce porte des kilos." }
];

async function main() {
  await prisma.setting.upsert({
    where: { key: 'lang' }, update: {}, create: { key: 'lang', value: 'fr' }
  });
  await prisma.setting.upsert({
    where: { key: 'filamentPricePerKg' }, update: {}, create: { key: 'filamentPricePerKg', value: '22' }
  });

  for (const item of CATALOGUE) {
    const existing = await prisma.model.findFirst({ where: { title: item.title } });
    if (existing) continue;

    const model = await prisma.model.create({
      data: {
        title: item.title,
        kind: 'LINK',
        category: item.category,
        summary: item.summary,
        platform: 'catalogue'
      }
    });

    for (const name of item.tags) {
      const tag = await prisma.tag.upsert({ where: { name }, update: {}, create: { name } });
      await prisma.tagOnModel.create({ data: { modelId: model.id, tagId: tag.id } });
    }
  }

  const counts = {
    pieces: await prisma.model.count(),
    tags: await prisma.tag.count(),
    reglages: await prisma.setting.count()
  };
  console.log('Base peuplée :', counts);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
