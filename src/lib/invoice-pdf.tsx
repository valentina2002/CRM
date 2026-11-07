import "server-only";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { invoiceTotal } from "@/lib/dashboard";
import { formatCOP, formatDay } from "@/lib/format";
import { amountInWordsCOP } from "@/lib/number-words";
import type { InvoiceWithDetails } from "@/lib/services/invoices";

type Issuer = { name: string; document: string; city: string; paymentInfo: string; showAmountInWords: boolean };

const ink = "#152033";
const muted = "#687487";
const line = "#e3e7ee";

const s = StyleSheet.create({
  page: { paddingVertical: 48, paddingHorizontal: 54, fontSize: 10.5, fontFamily: "Helvetica", color: ink, lineHeight: 1.45 },
  title: { textAlign: "center", fontSize: 15, fontFamily: "Helvetica-Bold", letterSpacing: 0.6 },
  city: { textAlign: "center", color: muted, marginTop: 4, marginBottom: 22 },
  bold: { fontFamily: "Helvetica-Bold" },
  muted: { color: muted },
  block: { marginBottom: 12 },
  table: { borderTopWidth: 1, borderColor: line, marginTop: 4 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderColor: line, paddingVertical: 5 },
  head: { backgroundColor: "#fafbfc", color: muted, fontFamily: "Helvetica-Bold", fontSize: 9 },
  cDesc: { flex: 1, paddingHorizontal: 4 },
  cQty: { width: 40, textAlign: "right", paddingHorizontal: 4 },
  cMoney: { width: 90, textAlign: "right", paddingHorizontal: 4 },
  totalRow: { flexDirection: "row", paddingVertical: 6 },
  small: { fontSize: 9.5 },
  signature: { marginTop: 48 },
});

function InvoicePdf({ invoice, issuer }: { invoice: InvoiceWithDetails; issuer: Issuer }) {
  const total = invoiceTotal(invoice);
  return (
    <Document title={`Cuenta de cobro ${invoice.number}`} author={issuer.name} language="es-CO">
      <Page size="LETTER" style={s.page}>
        <Text style={s.title}>CUENTA DE COBRO N.º {invoice.number}</Text>
        <Text style={s.city}>
          {issuer.city}, {formatDay(invoice.issueDate)}
        </Text>

        <View style={s.block}>
          <Text style={s.bold}>{invoice.contact.company || invoice.contact.name}</Text>
          {invoice.contact.company ? <Text style={s.muted}>Atención: {invoice.contact.name}</Text> : null}
        </View>

        <Text>DEBE A:</Text>
        <View style={s.block}>
          <Text style={s.bold}>{issuer.name}</Text>
          <Text>{issuer.document}</Text>
        </View>

        <Text style={s.block}>
          La suma de <Text style={s.bold}>{formatCOP(total)}</Text>
          {issuer.showAmountInWords ? ` (${amountInWordsCOP(total)})` : ""} por concepto de las siguientes actividades:
        </Text>

        <View style={s.table}>
          <View style={[s.row, s.head]} fixed>
            <Text style={s.cDesc}>Actividad</Text>
            <Text style={s.cQty}>Cant.</Text>
            <Text style={s.cMoney}>Valor unit.</Text>
            <Text style={s.cMoney}>Subtotal</Text>
          </View>
          {invoice.items.map((it) => (
            <View key={it.id} style={s.row} wrap={false}>
              <Text style={s.cDesc}>{it.description}</Text>
              <Text style={s.cQty}>{it.quantity}</Text>
              <Text style={s.cMoney}>{formatCOP(it.unitPrice)}</Text>
              <Text style={s.cMoney}>{formatCOP(it.quantity * it.unitPrice)}</Text>
            </View>
          ))}
          <View style={s.totalRow}>
            <Text style={[s.cDesc, s.bold, { textAlign: "right" }]}>TOTAL</Text>
            <Text style={[s.cMoney, s.bold]}>{formatCOP(total)}</Text>
          </View>
        </View>

        {invoice.notes ? <Text style={[s.small, { marginTop: 10 }]}>{invoice.notes}</Text> : null}

        <View style={{ marginTop: 12 }}>
          <Text style={s.small}>Fecha límite de pago: {formatDay(invoice.dueDate)}</Text>
          {issuer.paymentInfo ? <Text style={s.small}>{issuer.paymentInfo}</Text> : null}
        </View>

        <View style={s.signature} wrap={false}>
          <Text>_____________________________</Text>
          <Text>{issuer.name}</Text>
          <Text style={[s.small, s.muted]}>{issuer.document}</Text>
        </View>
      </Page>
    </Document>
  );
}

export function renderInvoicePdf(invoice: InvoiceWithDetails, issuer: Issuer): Promise<Buffer> {
  return renderToBuffer(<InvoicePdf invoice={invoice} issuer={issuer} />);
}

/** "CC-002 Megalamparas Guatemala.pdf" (ASCII, safe for headers and WhatsApp). */
export function invoiceFileName(invoice: InvoiceWithDetails): string {
  const who = (invoice.contact.company || invoice.contact.name)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\w\s.-]/g, "")
    .trim()
    .slice(0, 60);
  return `${invoice.number} ${who}.pdf`;
}
