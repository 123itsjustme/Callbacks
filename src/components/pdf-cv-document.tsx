import { Document, Page, StyleSheet, Text, View, Link } from "@react-pdf/renderer";

export type PdfCv = {
  name: string;
  headline?: string | null;
  location?: string | null;
  email?: string | null;
  website?: string | null;
  preparedFor?: string | null;
  summary: string;
  experience: { id: string; role: string; company: string; dates: string; highlights: string[] }[];
  projects: { id: string; title: string; client_or_org: string; description: string; impact_metric?: string }[];
  skills: string[];
  education: { institution: string; degree: string; year?: string }[];
  awards: string[];
};

const INK = "#16150f";
const MUTED = "#6b675c";
const ACCENT = "#1f4d3a";
const LINE = "#e3dfd4";

const s = StyleSheet.create({
  page: { paddingTop: 44, paddingBottom: 40, paddingHorizontal: 48, fontFamily: "Helvetica", fontSize: 9.5, color: INK, lineHeight: 1.45 },
  name: { fontFamily: "Times-Roman", fontSize: 28, letterSpacing: -0.5, lineHeight: 1.15 },
  headline: { fontSize: 11.5, color: MUTED, marginTop: 6 },
  meta: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8, fontSize: 8.5, color: MUTED },
  prepared: { marginTop: 10, fontSize: 8, color: ACCENT, textTransform: "uppercase", letterSpacing: 1 },
  rule: { borderBottomWidth: 1, borderBottomColor: LINE, marginVertical: 14 },
  h2: { fontSize: 8, letterSpacing: 1.4, textTransform: "uppercase", color: MUTED, marginBottom: 8, fontFamily: "Helvetica-Bold" },
  section: { marginBottom: 14 },
  roleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  role: { fontFamily: "Helvetica-Bold", fontSize: 10.5 },
  company: { color: MUTED, fontFamily: "Helvetica" },
  dates: { fontSize: 8.5, color: MUTED },
  bulletRow: { flexDirection: "row", marginTop: 2.5, paddingRight: 8 },
  bullet: { width: 10, color: MUTED },
  bulletText: { flex: 1 },
  item: { marginBottom: 10 },
  impact: { color: ACCENT, marginTop: 2, fontFamily: "Helvetica-Bold", fontSize: 9 },
  skills: { flexDirection: "row", flexWrap: "wrap", rowGap: 3 },
  skill: { marginRight: 10 },
  footer: { position: "absolute", bottom: 22, left: 48, right: 48, fontSize: 7.5, color: MUTED, flexDirection: "row", justifyContent: "space-between" },
});

export function PdfCvDocument({ cv }: { cv: PdfCv }) {
  return (
    <Document title={`${cv.name} — CV${cv.preparedFor ? ` for ${cv.preparedFor}` : ""}`} author={cv.name}>
      <Page size="A4" style={s.page}>
        <Text style={s.name}>{cv.name}</Text>
        {cv.headline ? <Text style={s.headline}>{cv.headline}</Text> : null}
        <View style={s.meta}>
          {cv.location ? <Text>{cv.location}</Text> : null}
          {cv.email ? <Link src={`mailto:${cv.email}`} style={{ color: MUTED, textDecoration: "none" }}>{cv.email}</Link> : null}
          {cv.website ? <Link src={cv.website} style={{ color: MUTED, textDecoration: "none" }}>{cv.website.replace(/^https?:\/\//, "")}</Link> : null}
        </View>
        {cv.preparedFor ? <Text style={s.prepared}>Prepared for {cv.preparedFor}</Text> : null}
        <View style={s.rule} />

        {cv.summary ? (
          <View style={s.section}>
            <Text style={s.h2}>Profile</Text>
            <Text>{cv.summary}</Text>
          </View>
        ) : null}

        {cv.experience.length ? (
          <View style={s.section}>
            <Text style={s.h2}>Experience</Text>
            {cv.experience.map((e) => (
              <View key={e.id} style={s.item} wrap={false}>
                <View style={s.roleRow}>
                  <Text style={s.role}>
                    {e.role} <Text style={s.company}>· {e.company}</Text>
                  </Text>
                  <Text style={s.dates}>{e.dates}</Text>
                </View>
                {e.highlights.map((h, i) => (
                  <View key={i} style={s.bulletRow}>
                    <Text style={s.bullet}>–</Text>
                    <Text style={s.bulletText}>{h}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ) : null}

        {cv.projects.length ? (
          <View style={s.section}>
            <Text style={s.h2}>Selected projects</Text>
            {cv.projects.map((p) => (
              <View key={p.id} style={s.item} wrap={false}>
                <Text style={s.role}>
                  {p.title} <Text style={s.company}>· {p.client_or_org}</Text>
                </Text>
                <Text style={{ marginTop: 2 }}>{p.description}</Text>
                {p.impact_metric ? <Text style={s.impact}>{p.impact_metric}</Text> : null}
              </View>
            ))}
          </View>
        ) : null}

        {cv.skills.length ? (
          <View style={s.section} wrap={false}>
            <Text style={s.h2}>Skills</Text>
            <View style={s.skills}>
              {cv.skills.map((sk, i) => (
                <Text key={i} style={s.skill}>
                  {sk}
                  {i < cv.skills.length - 1 ? "  ·" : ""}
                </Text>
              ))}
            </View>
          </View>
        ) : null}

        {cv.education.length ? (
          <View style={s.section}>
            <Text style={s.h2}>Education</Text>
            {cv.education.map((e, i) => (
              <Text key={i}>
                <Text style={{ fontFamily: "Helvetica-Bold" }}>{e.degree}</Text> — {e.institution}
                {e.year ? `, ${e.year}` : ""}
              </Text>
            ))}
          </View>
        ) : null}

        {cv.awards.length ? (
          <View style={s.section}>
            <Text style={s.h2} minPresenceAhead={14}>Awards</Text>
            {cv.awards.map((a, i) => (
              <Text key={i}>{a}</Text>
            ))}
          </View>
        ) : null}

        <View style={s.footer} fixed>
          <Text>{cv.name}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
