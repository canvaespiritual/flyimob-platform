"use server";

import {
  PDFDocument,
  PDFFont,
  PDFPage,
  StandardFonts,
  rgb,
} from "pdf-lib";

export type RemittancePdfOptions = {
  showClient: boolean;
  showBuilder: boolean;
  showDevelopment: boolean;

  showStageContext: boolean;

  showVgv: boolean;
  showSaleCommission: boolean;

  showRole: boolean;
  showRule: boolean;

  showEntitlement: boolean;
  showPixAllocation: boolean;

  showAdjustments: boolean;
  showAdjustmentBalance: boolean;

  showPaymentDestination: boolean;
  showPaymentDate: boolean;

  showPaymentNotes: boolean;

  showServiceNotice: boolean;
  showDirectorMessage: boolean;
};

export type RemittancePdfAttachment = {
  id: string;

  title:
    | string
    | null;

  originalName: string;

  mimeType:
    | string
    | null;

  bytes: Uint8Array;
};

export type RemittancePdfStageReference = {
  type: string;

  label:
    | string
    | null;

  status: string;

  paidAmount?: number;

  paidAt?:
    | string
    | null;
};

export type RemittancePdfItem = {
  allocationId: string;
  entitlementId: string;

  clientName: string;

  construtora:
    | string
    | null;

  empreendimento:
    | string
    | null;

  stageType: string;

  stageLabel:
    | string
    | null;

  stageContext:
    | "FIRST_WITH_FUTURE"
    | "LATER_WITH_PREVIOUS_PAID"
    | "SINGLE"
    | "EXTRA";

  stageSequence: number;

  previousStage:
    | RemittancePdfStageReference
    | null;

  nextStage:
    | RemittancePdfStageReference
    | null;

  role: string;

  customRoleLabel:
    | string
    | null;

  vgv:
    | number
    | null;

  saleCommission:
    | number
    | null;

  calculationBasis: string;

  percentage:
    | number
    | null;

  calculationBaseAmount:
    | number
    | null;

  fixedAmount:
    | number
    | null;

  entitlementFinalAmount: number;

  pixAllocation: number;
};

export type RemittancePdfAdjustment = {
  id: string;

  type: string;
  effect: string;

  description:
    | string
    | null;

  occurredAt: string;

  originalAmount: number;

  appliedInRemittance: number;
};

export type RemittancePdfData = {
  paymentId: string;

  participant: {
    id: string;
    name: string;

    cpfCnpj:
      | string
      | null;
  };

  paidAt:
    | string
    | null;

  amount: number;

  notes:
    | string
    | null;

  destinationPixType:
    | string
    | null;

  destinationPixKey:
    | string
    | null;

  destinationBankName:
    | string
    | null;

  destinationHolderName:
    | string
    | null;

  items: RemittancePdfItem[];

  adjustments: RemittancePdfAdjustment[];
};

export type BuildRemittancePdfInput = {
  data: RemittancePdfData;

  options: RemittancePdfOptions;

  directorMessage:
    | string
    | null;

  attachments: RemittancePdfAttachment[];

  /**
   * Logo opcional. PNG ou JPEG.
   * Se não for enviado, o cabeçalho usa "FLYIMOB" em texto.
   */
  logo?: {
    bytes: Uint8Array;
    mimeType: string;
  };
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;

const MARGIN_X = 44;
const TOP_Y = PAGE_HEIGHT - 46;
const BOTTOM_Y = 52;

const COLORS = {
  text: rgb(0.12, 0.14, 0.17),
  muted: rgb(0.43, 0.46, 0.51),
  lightText: rgb(0.58, 0.61, 0.66),
  line: rgb(0.88, 0.89, 0.91),
  soft: rgb(0.965, 0.968, 0.972),
  green: rgb(0.08, 0.48, 0.28),
  red: rgb(0.72, 0.16, 0.16),
  amberSoft: rgb(0.995, 0.975, 0.90),
};

function money(
  value: number
) {
  return new Intl.NumberFormat(
    "pt-BR",
    {
      style: "currency",
      currency: "BRL",
    }
  ).format(value);
}

function dateBR(
  value:
    | string
    | null
) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "pt-BR",
    {
      timeZone: "UTC",
    }
  ).format(
    new Date(value)
  );
}

function basisLabel(
  basis: string
) {
  switch (basis) {
    case "COMMISSION_GROSS":
      return "Sobre comissão bruta";

    case "COMMISSION_NET_AFTER_WITHHOLDING":
      return "Sobre comissão após retenção";

    case "COMMISSION_NET_AFTER_ALL_TAXES":
      return "Sobre comissão após impostos";

    case "VGV":
      return "Sobre VGV";

    case "FIXED":
      return "Valor fixo";

    case "MANUAL":
      return "Valor manual";

    default:
      return basis;
  }
}

function roleLabel(
  role: string,
  custom:
    | string
    | null
) {
  if (
    role === "OTHER" &&
    custom
  ) {
    return custom;
  }

  switch (role) {
    case "BROKER":
      return "Corretor";

    case "MANAGER":
      return "Gerente";

    case "FILE_OPERATOR":
      return "Operador de cadastro";

    case "MARKETING":
      return "Marketing";

    case "INDICATOR":
      return "Indicador";

    case "CLOSER":
      return "Closer";

    case "INCORPORATOR":
      return "Incorporador";

    case "BONUS":
      return "Bonificação";

    default:
      return role;
  }
}

function stageLabel(
  type: string,
  label:
    | string
    | null
) {
  if (
    label &&
    label.trim()
  ) {
    return label.trim();
  }

  switch (type) {
    case "ATO":
      return "Ato";

    case "BANCO":
      return "Assinatura bancária";

    case "PREMIO":
      return "Premiação";

    case "COMPLEMENTO":
      return "Complemento";

    default:
      return "Etapa";
  }
}

function ruleText(
  item: RemittancePdfItem
) {
  if (
    item.calculationBasis ===
    "FIXED"
  ) {
    return `Valor fixo ${
      item.fixedAmount != null
        ? money(item.fixedAmount)
        : ""
    }`.trim();
  }

  if (
    item.calculationBasis ===
    "MANUAL"
  ) {
    return "Valor definido manualmente";
  }

  if (
    item.percentage != null
  ) {
    const percentage =
      item.percentage.toLocaleString(
        "pt-BR",
        {
          maximumFractionDigits: 4,
        }
      );

    return `${percentage}% • ${basisLabel(
      item.calculationBasis
    )}`;
  }

  return basisLabel(
    item.calculationBasis
  );
}

function stageContextText(
  item: RemittancePdfItem
) {
  const current =
    stageLabel(
      item.stageType,
      item.stageLabel
    );

  if (
    item.stageContext ===
    "FIRST_WITH_FUTURE" &&
    item.nextStage
  ) {
    const next =
      stageLabel(
        item.nextStage.type,
        item.nextStage.label
      );

    return {
      title:
        `Etapa ${item.stageSequence} — ${current}`,

      text:
        `Pagamento referente à primeira etapa desta venda. Há previsão de nova participação financeira na etapa ${next}, conforme o andamento da operação.`,
    };
  }

  if (
    item.stageContext ===
    "LATER_WITH_PREVIOUS_PAID" &&
    item.previousStage
  ) {
    const previous =
      stageLabel(
        item.previousStage.type,
        item.previousStage.label
      );

    const previousDate =
      item.previousStage.paidAt
        ? ` em ${dateBR(
            item.previousStage.paidAt
          )}`
        : "";

    const previousAmount =
      item.previousStage.paidAmount != null &&
      item.previousStage.paidAmount > 0
        ? `, no valor de ${money(
            item.previousStage.paidAmount
          )}`
        : "";

    return {
      title:
        `Etapa ${item.stageSequence} — ${current}`,

      text:
        `${previous} já foi liquidada anteriormente${previousDate}${previousAmount}. Este pagamento corresponde à etapa atual da venda.`,
    };
  }

  if (
    item.stageContext ===
    "EXTRA"
  ) {
    return {
      title:
        current,

      text:
        "Lançamento extraordinário, separado das etapas principais da comissão da venda.",
    };
  }

  return {
    title:
      `Etapa ${item.stageSequence} — ${current}`,

    text:
      "Etapa financeira consolidada nesta remessa.",
  };
}

function splitLongWord(
  word: string,
  font: PDFFont,
  size: number,
  maxWidth: number
) {
  const parts: string[] = [];

  let current = "";

  for (
    const char
    of word
  ) {
    const candidate =
      current + char;

    if (
      font.widthOfTextAtSize(
        candidate,
        size
      ) >
        maxWidth &&
      current
    ) {
      parts.push(
        current
      );

      current =
        char;
    } else {
      current =
        candidate;
    }
  }

  if (
    current
  ) {
    parts.push(
      current
    );
  }

  return parts;
}

function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number
) {
  const normalized =
    String(
      text || ""
    )
      .replace(
        /\r/g,
        ""
      )
      .split("\n");

  const lines: string[] =
    [];

  for (
    const paragraph
    of normalized
  ) {
    if (
      !paragraph.trim()
    ) {
      lines.push(
        ""
      );

      continue;
    }

    const rawWords =
      paragraph
        .trim()
        .split(/\s+/);

    const words: string[] =
      [];

    for (
      const rawWord
      of rawWords
    ) {
      if (
        font.widthOfTextAtSize(
          rawWord,
          size
        ) >
        maxWidth
      ) {
        words.push(
          ...splitLongWord(
            rawWord,
            font,
            size,
            maxWidth
          )
        );
      } else {
        words.push(
          rawWord
        );
      }
    }

    let line =
      "";

    for (
      const word
      of words
    ) {
      const candidate =
        line
          ? `${line} ${word}`
          : word;

      if (
        font.widthOfTextAtSize(
          candidate,
          size
        ) <=
        maxWidth
      ) {
        line =
          candidate;
      } else {
        if (
          line
        ) {
          lines.push(
            line
          );
        }

        line =
          word;
      }
    }

    if (
      line
    ) {
      lines.push(
        line
      );
    }
  }

  return lines;
}

type Writer = {
  pdf: PDFDocument;

  regular: PDFFont;
  bold: PDFFont;

  page: PDFPage;
  y: number;

  pageNumber: number;
};

function addPage(
  writer: Writer
) {
  writer.page =
    writer.pdf.addPage([
      PAGE_WIDTH,
      PAGE_HEIGHT,
    ]);

  writer.y =
    TOP_Y;

  writer.pageNumber +=
    1;

  return writer.page;
}

function ensureSpace(
  writer: Writer,
  needed: number
) {
  if (
    writer.y -
      needed <
    BOTTOM_Y
  ) {
    addPage(
      writer
    );

    return true;
  }

  return false;
}

function drawLine(
  writer: Writer,
  y?: number
) {
  const targetY =
    y ??
    writer.y;

  writer.page.drawLine({
    start: {
      x: MARGIN_X,
      y: targetY,
    },

    end: {
      x:
        PAGE_WIDTH -
        MARGIN_X,
      y: targetY,
    },

    thickness: 0.7,
    color:
      COLORS.line,
  });
}

function drawTextBlock(
  writer: Writer,
  text: string,
  options?: {
    x?: number;
    width?: number;

    size?: number;
    lineHeight?: number;

    font?: PDFFont;

    color?: ReturnType<
      typeof rgb
    >;

    gapAfter?: number;
  }
) {
  const x =
    options?.x ??
    MARGIN_X;

  const width =
    options?.width ??
    PAGE_WIDTH -
      MARGIN_X * 2;

  const size =
    options?.size ??
    10;

  const lineHeight =
    options?.lineHeight ??
    size * 1.35;

  const font =
    options?.font ??
    writer.regular;

  const color =
    options?.color ??
    COLORS.text;

  const gapAfter =
    options?.gapAfter ??
    0;

  const lines =
    wrapText(
      text,
      font,
      size,
      width
    );

  for (
    const line
    of lines
  ) {
    ensureSpace(
      writer,
      lineHeight
    );

    if (
      line
    ) {
      writer.page.drawText(
        line,
        {
          x,
          y:
            writer.y -
            size,
          size,
          font,
          color,
        }
      );
    }

    writer.y -=
      lineHeight;
  }

  writer.y -=
    gapAfter;

  return lines.length *
      lineHeight +
    gapAfter;
}

function drawLabelValue(
  writer: Writer,
  label: string,
  value: string,
  x: number,
  width: number
) {
  writer.page.drawText(
    label.toUpperCase(),
    {
      x,
      y:
        writer.y -
        8,
      size: 7,
      font:
        writer.bold,
      color:
        COLORS.lightText,
    }
  );

  const lines =
    wrapText(
      value,
      writer.bold,
      10,
      width
    );

  let lineY =
    writer.y -
    22;

  for (
    const line
    of lines.slice(
      0,
      3
    )
  ) {
    writer.page.drawText(
      line,
      {
        x,
        y:
          lineY,
        size: 10,
        font:
          writer.bold,
        color:
          COLORS.text,
      }
    );

    lineY -=
      12;
  }
}

function drawHeader(
  writer: Writer,
  input: BuildRemittancePdfInput,
  logoImage?: {
    width: number;
    height: number;
    draw: (
      page: PDFPage,
      x: number,
      y: number,
      width: number,
      height: number
    ) => void;
  }
) {
  const {
    data,
    options,
  } =
    input;

  if (
    logoImage
  ) {
    const maxWidth =
      110;

    const maxHeight =
      38;

    const ratio =
      Math.min(
        maxWidth /
          logoImage.width,
        maxHeight /
          logoImage.height
      );

    const width =
      logoImage.width *
      ratio;

    const height =
      logoImage.height *
      ratio;

    logoImage.draw(
      writer.page,
      MARGIN_X,
      writer.y -
        height,
      width,
      height
    );

    writer.y -=
      height +
      10;
  } else {
    writer.page.drawText(
      "FLYIMOB",
      {
        x: MARGIN_X,
        y:
          writer.y -
          18,
        size: 20,
        font:
          writer.bold,
        color:
          COLORS.text,
      }
    );

    writer.y -=
      30;
  }

  writer.page.drawText(
    "DEMONSTRATIVO DE PAGAMENTO",
    {
      x: MARGIN_X,
      y:
        writer.y -
        10,
      size: 8,
      font:
        writer.bold,
      color:
        COLORS.lightText,
    }
  );

  writer.y -=
    30;

  const leftWidth =
    300;

  drawLabelValue(
    writer,
    "Consultor",
    data.participant.name,
    MARGIN_X,
    leftWidth
  );

  writer.page.drawText(
    "VALOR TRANSFERIDO",
    {
      x:
        PAGE_WIDTH -
        MARGIN_X -
        190,
      y:
        writer.y -
        8,
      size: 7,
      font:
        writer.bold,
      color:
        COLORS.lightText,
    }
  );

  const amountText =
    money(
      data.amount
    );

  writer.page.drawText(
    amountText,
    {
      x:
        PAGE_WIDTH -
        MARGIN_X -
        writer.bold.widthOfTextAtSize(
          amountText,
          18
        ),
      y:
        writer.y -
        30,
      size: 18,
      font:
        writer.bold,
      color:
        COLORS.text,
    }
  );

  writer.y -=
    54;

  const metaParts: string[] =
    [];

  if (
    options.showPaymentDate
  ) {
    metaParts.push(
      `Pagamento: ${dateBR(
        data.paidAt
      )}`
    );
  }

  if (
    options.showPaymentDestination
  ) {
    if (
      data.destinationPixKey
    ) {
      metaParts.push(
        `Destino: PIX ${
          data.destinationPixType ||
          ""
        } • ${
          data.destinationPixKey
        }`
      );
    } else if (
      data.destinationBankName
    ) {
      metaParts.push(
        `Destino: ${
          data.destinationBankName
        }`
      );
    }
  }

  if (
    metaParts.length >
    0
  ) {
    drawTextBlock(
      writer,
      metaParts.join(
        "     "
      ),
      {
        size: 9,
        color:
          COLORS.muted,
        gapAfter: 12,
      }
    );
  }

  drawLine(
    writer
  );

  writer.y -=
    16;

  if (
    options.showServiceNotice
  ) {
    const notice =
      "Demonstrativo referente a serviço prestado de forma avulsa por consultor independente.";

    const noticeLines =
      wrapText(
        notice,
        writer.regular,
        8.5,
        PAGE_WIDTH -
          MARGIN_X * 2 -
          20
      );

    const height =
      Math.max(
        34,
        noticeLines.length *
          11 +
          18
      );

    ensureSpace(
      writer,
      height
    );

    writer.page.drawRectangle({
      x: MARGIN_X,
      y:
        writer.y -
        height,
      width:
        PAGE_WIDTH -
        MARGIN_X * 2,
      height,
      color:
        COLORS.soft,
      borderColor:
        COLORS.line,
      borderWidth: 0.5,
    });

    const oldY =
      writer.y;

    writer.y -=
      9;

    drawTextBlock(
      writer,
      notice,
      {
        x:
          MARGIN_X +
          10,
        width:
          PAGE_WIDTH -
          MARGIN_X * 2 -
          20,
        size: 8.5,
        lineHeight: 11,
        color:
          COLORS.muted,
      }
    );

    writer.y =
      oldY -
      height -
      16;
  }
}

function drawStageContext(
  writer: Writer,
  item: RemittancePdfItem
) {
  const context =
    stageContextText(
      item
    );

  const width =
    PAGE_WIDTH -
    MARGIN_X * 2;

  const textLines =
    wrapText(
      context.text,
      writer.regular,
      8.5,
      width -
        20
    );

  const height =
    32 +
    textLines.length *
      11;

  ensureSpace(
    writer,
    height +
      8
  );

  writer.page.drawRectangle({
    x: MARGIN_X,
    y:
      writer.y -
      height,
    width,
    height,
    color:
      COLORS.amberSoft,
    borderColor:
      rgb(
        0.93,
        0.80,
        0.44
      ),
    borderWidth: 0.6,
  });

  writer.page.drawText(
    context.title,
    {
      x:
        MARGIN_X +
        10,
      y:
        writer.y -
        15,
      size: 8.5,
      font:
        writer.bold,
      color:
        COLORS.text,
    }
  );

  let y =
    writer.y -
    29;

  for (
    const line
    of textLines
  ) {
    writer.page.drawText(
      line,
      {
        x:
          MARGIN_X +
          10,
        y,
        size: 8.5,
        font:
          writer.regular,
        color:
          COLORS.muted,
      }
    );

    y -=
      11;
  }

  writer.y -=
    height +
    10;
}

function drawItem(
  writer: Writer,
  item: RemittancePdfItem,
  index: number,
  options: RemittancePdfOptions
) {
  ensureSpace(
    writer,
    118
  );

  const width =
    PAGE_WIDTH -
    MARGIN_X * 2;

  writer.page.drawRectangle({
    x: MARGIN_X,
    y:
      writer.y -
      40,
    width,
    height: 40,
    color:
      rgb(
        1,
        1,
        1
      ),
    borderColor:
      COLORS.line,
    borderWidth: 0.7,
  });

  writer.page.drawText(
    `SERVIÇO ${index + 1}`,
    {
      x:
        MARGIN_X +
        10,
      y:
        writer.y -
        12,
      size: 7,
      font:
        writer.bold,
      color:
        COLORS.lightText,
    }
  );

  if (
    options.showClient
  ) {
    const clientLines =
      wrapText(
        item.clientName,
        writer.bold,
        10,
        300
      );

    writer.page.drawText(
      clientLines[0] ||
        "—",
      {
        x:
          MARGIN_X +
          10,
        y:
          writer.y -
          27,
        size: 10,
        font:
          writer.bold,
        color:
          COLORS.text,
      }
    );
  }

  if (
    options.showPixAllocation
  ) {
    const amount =
      money(
        item.pixAllocation
      );

    writer.page.drawText(
      "NESTA REMESSA",
      {
        x:
          PAGE_WIDTH -
          MARGIN_X -
          150,
        y:
          writer.y -
          12,
        size: 7,
        font:
          writer.bold,
        color:
          COLORS.lightText,
      }
    );

    writer.page.drawText(
      amount,
      {
        x:
          PAGE_WIDTH -
          MARGIN_X -
          10 -
          writer.bold.widthOfTextAtSize(
            amount,
            10
          ),
        y:
          writer.y -
          28,
        size: 10,
        font:
          writer.bold,
        color:
          COLORS.text,
      }
    );
  }

  writer.y -=
    48;

  const secondary: string[] =
    [];

  if (
    options.showBuilder
  ) {
    secondary.push(
      item.construtora ||
        "Construtora não informada"
    );
  }

  if (
    options.showDevelopment
  ) {
    secondary.push(
      item.empreendimento ||
        "Empreendimento não informado"
    );
  }

  if (
    secondary.length >
    0
  ) {
    drawTextBlock(
      writer,
      secondary.join(
        " • "
      ),
      {
        size: 8.5,
        color:
          COLORS.muted,
        gapAfter: 10,
      }
    );
  }

  if (
    options.showStageContext
  ) {
    drawStageContext(
      writer,
      item
    );
  }

  const info: Array<{
    label: string;
    value: string;
  }> = [];

  if (
    options.showVgv
  ) {
    info.push({
      label: "VGV",
      value:
        item.vgv != null
          ? money(
              item.vgv
            )
          : "—",
    });
  }

  if (
    options.showSaleCommission
  ) {
    info.push({
      label:
        "Comissão da venda",
      value:
        item.saleCommission !=
        null
          ? money(
              item.saleCommission
            )
          : "—",
    });
  }

  if (
    options.showRole
  ) {
    info.push({
      label:
        "Participação",
      value:
        roleLabel(
          item.role,
          item.customRoleLabel
        ),
    });
  }

  if (
    options.showEntitlement
  ) {
    info.push({
      label:
        "Direito",
      value:
        money(
          item.entitlementFinalAmount
        ),
    });
  }

  if (
    info.length >
    0
  ) {
    const columns =
      Math.min(
        4,
        info.length
      );

    const columnWidth =
      width /
      columns;

    const rows =
      Math.ceil(
        info.length /
          columns
      );

    const blockHeight =
      rows *
        42 +
      4;

    ensureSpace(
      writer,
      blockHeight
    );

    for (
      let indexInfo = 0;
      indexInfo <
      info.length;
      indexInfo += 1
    ) {
      const column =
        indexInfo %
        columns;

      const row =
        Math.floor(
          indexInfo /
            columns
        );

      const x =
        MARGIN_X +
        column *
          columnWidth;

      const y =
        writer.y -
        row *
          42;

      writer.page.drawText(
        info[indexInfo]
          .label.toUpperCase(),
        {
          x,
          y:
            y -
            8,
          size: 6.5,
          font:
            writer.bold,
          color:
            COLORS.lightText,
        }
      );

      const valueLines =
        wrapText(
          info[indexInfo]
            .value,
          writer.bold,
          9,
          columnWidth -
            10
        );

      writer.page.drawText(
        valueLines[0] ||
          "—",
        {
          x,
          y:
            y -
            23,
          size: 9,
          font:
            writer.bold,
          color:
            COLORS.text,
        }
      );
    }

    writer.y -=
      blockHeight;
  }

  if (
    options.showRule
  ) {
    const parts =
      [
        `Regra: ${ruleText(
          item
        )}`,
      ];

    if (
      item.calculationBaseAmount !=
      null
    ) {
      parts.push(
        `Base: ${money(
          item.calculationBaseAmount
        )}`
      );
    }

    drawTextBlock(
      writer,
      parts.join(
        " • "
      ),
      {
        size: 8.5,
        color:
          COLORS.muted,
        gapAfter: 8,
      }
    );
  }

  drawLine(
    writer
  );

  writer.y -=
    18;
}

function drawAdjustments(
  writer: Writer,
  adjustments: RemittancePdfAdjustment[],
  options: RemittancePdfOptions
) {
  if (
    !options.showAdjustments ||
    adjustments.length ===
      0
  ) {
    return;
  }

  ensureSpace(
    writer,
    70
  );

  drawTextBlock(
    writer,
    "VALES E AJUSTES",
    {
      size: 8,
      font:
        writer.bold,
      color:
        COLORS.lightText,
      gapAfter: 8,
    }
  );

  for (
    const adjustment
    of adjustments
  ) {
    ensureSpace(
      writer,
      42
    );

    const description =
      adjustment.description ||
      "Vale / adiantamento";

    drawTextBlock(
      writer,
      `${description} • ${dateBR(
        adjustment.occurredAt
      )}`,
      {
        width: 340,
        size: 9,
        font:
          writer.bold,
      }
    );

    const amountText =
      `-${money(
        adjustment.appliedInRemittance
      )}`;

    writer.page.drawText(
      amountText,
      {
        x:
          PAGE_WIDTH -
          MARGIN_X -
          writer.bold.widthOfTextAtSize(
            amountText,
            10
          ),
        y:
          writer.y +
          7,
        size: 10,
        font:
          writer.bold,
        color:
          COLORS.red,
      }
    );

    if (
      options.showAdjustmentBalance
    ) {
      drawTextBlock(
        writer,
        `Valor original: ${money(
          adjustment.originalAmount
        )}`,
        {
          size: 8,
          color:
            COLORS.muted,
          gapAfter: 6,
        }
      );
    } else {
      writer.y -=
        4;
    }

    drawLine(
      writer
    );

    writer.y -=
      10;
  }

  writer.y -=
    4;
}

function drawSummary(
  writer: Writer,
  data: RemittancePdfData
) {
  const totalRights =
    data.items.reduce(
      (
        total,
        item
      ) =>
        total +
        item.entitlementFinalAmount,
      0
    );

  const totalAdjustments =
    data.adjustments.reduce(
      (
        total,
        adjustment
      ) =>
        total +
        adjustment.appliedInRemittance,
      0
    );

  ensureSpace(
    writer,
    86
  );

  const width =
    PAGE_WIDTH -
    MARGIN_X * 2;

  writer.page.drawRectangle({
    x: MARGIN_X,
    y:
      writer.y -
      66,
    width,
    height: 66,
    color:
      COLORS.soft,
    borderColor:
      COLORS.line,
    borderWidth: 0.7,
  });

  const column =
    width /
    3;

  const fields = [
    {
      label:
        "Direitos",
      value:
        money(
          totalRights
        ),
      color:
        COLORS.text,
    },

    {
      label:
        "Vales / ajustes",
      value:
        `-${money(
          totalAdjustments
        )}`,
      color:
        COLORS.red,
    },

    {
      label:
        "Total pago",
      value:
        money(
          data.amount
        ),
      color:
        COLORS.text,
    },
  ];

  fields.forEach(
    (
      field,
      index
    ) => {
      const x =
        MARGIN_X +
        index *
          column +
        12;

      writer.page.drawText(
        field.label.toUpperCase(),
        {
          x,
          y:
            writer.y -
            18,
          size: 6.5,
          font:
            writer.bold,
          color:
            COLORS.lightText,
        }
      );

      writer.page.drawText(
        field.value,
        {
          x,
          y:
            writer.y -
            40,
          size:
            index ===
            2
              ? 12
              : 10,
          font:
            writer.bold,
          color:
            field.color,
        }
      );
    }
  );

  writer.y -=
    82;
}

function drawDirectorMessage(
  writer: Writer,
  message:
    | string
    | null,
  options: RemittancePdfOptions
) {
  if (
    !options.showDirectorMessage ||
    !message?.trim()
  ) {
    return;
  }

  const lines =
    wrapText(
      message.trim(),
      writer.regular,
      9,
      PAGE_WIDTH -
        MARGIN_X * 2 -
        20
    );

  const height =
    34 +
    lines.length *
      12;

  ensureSpace(
    writer,
    height +
      8
  );

  writer.page.drawRectangle({
    x: MARGIN_X,
    y:
      writer.y -
      height,
    width:
      PAGE_WIDTH -
      MARGIN_X * 2,
    height,
    color:
      rgb(
        1,
        1,
        1
      ),
    borderColor:
      COLORS.line,
    borderWidth: 0.7,
  });

  writer.page.drawText(
    "MENSAGEM DO DIRETOR",
    {
      x:
        MARGIN_X +
        10,
      y:
        writer.y -
        15,
      size: 7,
      font:
        writer.bold,
      color:
        COLORS.lightText,
    }
  );

  let y =
    writer.y -
    31;

  for (
    const line
    of lines
  ) {
    writer.page.drawText(
      line,
      {
        x:
          MARGIN_X +
          10,
        y,
        size: 9,
        font:
          writer.regular,
        color:
          COLORS.text,
      }
    );

    y -=
      12;
  }

  writer.y -=
    height +
    14;
}

function drawNotes(
  writer: Writer,
  data: RemittancePdfData,
  options: RemittancePdfOptions
) {
  if (
    !options.showPaymentNotes ||
    !data.notes?.trim()
  ) {
    return;
  }

  drawTextBlock(
    writer,
    "OBSERVAÇÕES DA REMESSA",
    {
      size: 7,
      font:
        writer.bold,
      color:
        COLORS.lightText,
      gapAfter: 5,
    }
  );

  drawTextBlock(
    writer,
    data.notes.trim(),
    {
      size: 9,
      color:
        COLORS.muted,
      gapAfter: 12,
    }
  );
}

function drawFooter(
  writer: Writer,
  paymentId: string
) {
  writer.page.drawText(
    `Documento gerado pela plataforma Flyimob • Remessa ${paymentId}`,
    {
      x: MARGIN_X,
      y: 24,
      size: 6.5,
      font:
        writer.regular,
      color:
        COLORS.lightText,
    }
  );

  const pageText =
    `Página ${writer.pageNumber}`;

  writer.page.drawText(
    pageText,
    {
      x:
        PAGE_WIDTH -
        MARGIN_X -
        writer.regular.widthOfTextAtSize(
          pageText,
          6.5
        ),
      y: 24,
      size: 6.5,
      font:
        writer.regular,
      color:
        COLORS.lightText,
    }
  );
}

async function appendPdfAttachment(
  target: PDFDocument,
  bytes: Uint8Array
) {
  const source =
    await PDFDocument.load(
      bytes,
      {
        ignoreEncryption:
          true,
      }
    );

  const indices =
    source.getPageIndices();

  const pages =
    await target.copyPages(
      source,
      indices
    );

  for (
    const page
    of pages
  ) {
    target.addPage(
      page
    );
  }
}

async function appendImageAttachment(
  target: PDFDocument,
  attachment: RemittancePdfAttachment
) {
  const mime =
    (
      attachment.mimeType ||
      ""
    ).toLowerCase();

  const name =
    attachment.originalName.toLowerCase();

  const image =
    mime.includes(
      "png"
    ) ||
    name.endsWith(
      ".png"
    )
      ? await target.embedPng(
          attachment.bytes
        )
      : await target.embedJpg(
          attachment.bytes
        );

  const page =
    target.addPage([
      PAGE_WIDTH,
      PAGE_HEIGHT,
    ]);

  const maxWidth =
    PAGE_WIDTH -
    60;

  const maxHeight =
    PAGE_HEIGHT -
    100;

  const ratio =
    Math.min(
      maxWidth /
        image.width,
      maxHeight /
        image.height
    );

  const width =
    image.width *
    ratio;

  const height =
    image.height *
    ratio;

  page.drawText(
    attachment.title ||
      attachment.originalName,
    {
      x: 30,
      y:
        PAGE_HEIGHT -
        36,
      size: 9,
      font:
        await target.embedFont(
          StandardFonts.HelveticaBold
        ),
      color:
        COLORS.text,
    }
  );

  page.drawImage(
    image,
    {
      x:
        (PAGE_WIDTH -
          width) /
        2,

      y:
        (PAGE_HEIGHT -
          height) /
          2 -
        10,

      width,
      height,
    }
  );
}

async function prepareLogo(
  pdf: PDFDocument,
  logo:
    | BuildRemittancePdfInput["logo"]
    | undefined
) {
  if (
    !logo
  ) {
    return undefined;
  }

  const mime =
    logo.mimeType.toLowerCase();

  try {
    const image =
      mime.includes(
        "png"
      )
        ? await pdf.embedPng(
            logo.bytes
          )
        : await pdf.embedJpg(
            logo.bytes
          );

    return {
      width:
        image.width,

      height:
        image.height,

      draw(
        page: PDFPage,
        x: number,
        y: number,
        width: number,
        height: number
      ) {
        page.drawImage(
          image,
          {
            x,
            y,
            width,
            height,
          }
        );
      },
    };
  } catch {
    return undefined;
  }
}

export async function buildRemittancePdf(
  input: BuildRemittancePdfInput
) {
  const pdf =
    await PDFDocument.create();

  pdf.setTitle(
    `Demonstrativo de pagamento - ${input.data.participant.name}`
  );

  pdf.setSubject(
    `Remessa ${input.data.paymentId}`
  );

  pdf.setCreator(
    "Flyimob"
  );

  pdf.setProducer(
    "Flyimob"
  );

  const regular =
    await pdf.embedFont(
      StandardFonts.Helvetica
    );

  const bold =
    await pdf.embedFont(
      StandardFonts.HelveticaBold
    );

  const firstPage =
    pdf.addPage([
      PAGE_WIDTH,
      PAGE_HEIGHT,
    ]);

  const writer: Writer =
    {
      pdf,
      regular,
      bold,

      page:
        firstPage,

      y:
        TOP_Y,

      pageNumber:
        1,
    };

  const logo =
    await prepareLogo(
      pdf,
      input.logo
    );

  drawHeader(
    writer,
    input,
    logo
  );

  input.data.items.forEach(
    (
      item,
      index
    ) => {
      drawItem(
        writer,
        item,
        index,
        input.options
      );
    }
  );

  drawAdjustments(
    writer,
    input.data.adjustments,
    input.options
  );

  drawSummary(
    writer,
    input.data
  );

  drawNotes(
    writer,
    input.data,
    input.options
  );

  drawDirectorMessage(
    writer,
    input.directorMessage,
    input.options
  );

  /*
   * Aplica rodapé em todas as páginas
   * geradas pelo corpo do demonstrativo.
   */
  const statementPages =
    pdf.getPages();

  statementPages.forEach(
    (
      page,
      index
    ) => {
      writer.page =
        page;

      writer.pageNumber =
        index +
        1;

      drawFooter(
        writer,
        input.data.paymentId
      );
    }
  );

  /*
   * Os comprovantes selecionados entram
   * depois do demonstrativo, no mesmo PDF.
   */
  for (
    const attachment
    of input.attachments
  ) {
    const mime =
      (
        attachment.mimeType ||
        ""
      ).toLowerCase();

    const name =
      attachment.originalName.toLowerCase();

    try {
      if (
        mime.includes(
          "pdf"
        ) ||
        name.endsWith(
          ".pdf"
        )
      ) {
        await appendPdfAttachment(
          pdf,
          attachment.bytes
        );

        continue;
      }

      if (
        mime.includes(
          "jpeg"
        ) ||
        mime.includes(
          "jpg"
        ) ||
        mime.includes(
          "png"
        ) ||
        name.endsWith(
          ".jpg"
        ) ||
        name.endsWith(
          ".jpeg"
        ) ||
        name.endsWith(
          ".png"
        )
      ) {
        await appendImageAttachment(
          pdf,
          attachment
        );
      }
    } catch {
      /*
       * Um comprovante corrompido não deve
       * impedir a geração de todo o relatório.
       * A API poderá registrar/retornar avisos
       * sobre arquivos ignorados posteriormente.
       */
    }
  }

  return pdf.save();
}