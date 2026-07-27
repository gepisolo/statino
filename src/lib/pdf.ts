// Client-facing PDF export of the monthly statino grid. The view hands
// over display-ready strings (no amounts, no rates: the report mirrors
// the grid, which is exactly what the client may see); only layout
// lives here. jspdf is imported lazily so it stays out of the main
// bundle.

export interface StatinoPdfEntry {
  text: string;
  link: string | null;
  hours: string;
}

export interface StatinoPdfDay {
  label: string; // "01 mer"
  weekend: boolean;
  entries: StatinoPdfEntry[];
}

export interface StatinoPdfInput {
  clientName: string;
  periodLabel: string; // "luglio 2026"
  totalHours: string;
  days: StatinoPdfDay[];
  fileName: string;
}

interface BodyCell {
  content: string;
  rowSpan?: number;
}

export async function exportStatinoPdf(input: StatinoPdfInput): Promise<void> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(`Statino — ${input.clientName}`, 14, 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(110);
  doc.text(input.periodLabel, 14, 24.5);
  doc.setTextColor(0);

  // One body row per activity; the day cell spans its activities.
  const body: BodyCell[][] = [];
  const rowMeta: { weekend: boolean; link: string | null }[] = [];
  for (const day of input.days) {
    if (!day.entries.length) {
      body.push([{ content: day.label }, { content: '' }, { content: '' }]);
      rowMeta.push({ weekend: day.weekend, link: null });
      continue;
    }
    day.entries.forEach((e, idx) => {
      const row: BodyCell[] =
        idx === 0 ? [{ content: day.label, rowSpan: day.entries.length }] : [];
      row.push({ content: e.text }, { content: e.hours });
      body.push(row);
      rowMeta.push({ weekend: day.weekend, link: e.link });
    });
  }

  autoTable(doc, {
    startY: 30,
    theme: 'grid',
    head: [['Giorno', 'Attività', 'Ore']],
    body,
    foot: [['TOTALE', '', input.totalHours]],
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      cellPadding: 1.6,
      lineColor: [225, 225, 225],
      lineWidth: 0.15,
      textColor: 30,
    },
    headStyles: { fillColor: [242, 242, 242], textColor: 30, fontStyle: 'bold' },
    footStyles: { fillColor: [242, 242, 242], textColor: 30, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 20 },
      2: { cellWidth: 14, halign: 'right' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && rowMeta[data.row.index]?.weekend) {
        data.cell.styles.fillColor = [255, 241, 242];
      }
      if (data.section !== 'body' && data.column.index === 2) {
        data.cell.styles.halign = 'right';
      }
    },
    didDrawCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 1) return;
      const link = rowMeta[data.row.index]?.link;
      if (link) {
        doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url: link });
      }
    },
  });

  doc.setProperties({ title: `Statino ${input.clientName} — ${input.periodLabel}` });
  doc.save(input.fileName);
}
