import { Metadata } from "next";
import CursoDetalleCliente from "./CursoDetalleCliente";

// IDs de cursos del seed_data.gql (conocidos en build time)
const COURSE_IDS = [
  "0b7c1a2e00014c3a9d5e000000000001",
  "0b7c1a2e00014c3a9d5e000000000002",
  "0b7c1a2e00014c3a9d5e000000000003",
  "0b7c1a2e00014c3a9d5e000000000004",
  "0b7c1a2e00014c3a9d5e000000000005",
  "0b7c1a2e00014c3a9d5e000000000006",
  "0b7c1a2e00014c3a9d5e000000000007",
];

export function generateStaticParams() {
  return COURSE_IDS.map((cursoId) => ({ cursoId }));
}

interface Props {
  params: Promise<{ cursoId: string }>;
}

export default async function CursoDetallePage({ params }: Props) {
  const { cursoId } = await params;
  return <CursoDetalleCliente cursoId={cursoId} />;
}