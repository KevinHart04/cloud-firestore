"use client";

import ResenasCurso from "@/app/components/ResenasCurso";

interface Props {
  cursoId: string;
}

// Datos de cursos del seed_data.gql (hardcodeados para evitar CORS del emulador Data Connect)
const CURSOS: Record<string, { titulo: string; nivel: string; horas: number; descripcion: string; cupo: number }> = {
  "0b7c1a2e00014c3a9d5e000000000001": { titulo: "Git y flujos de trabajo en equipo", nivel: "inicial", horas: 12, descripcion: "Branches, pull requests, revisiones de código y resolución de conflictos.", cupo: 30 },
  "0b7c1a2e00014c3a9d5e000000000002": { titulo: "Integración y entrega continua", nivel: "intermedio", horas: 16, descripcion: "Pipelines, entornos efímeros, despliegues progresivos y rollback.", cupo: 25 },
  "0b7c1a2e00014c3a9d5e000000000003": { titulo: "Seguridad en aplicaciones web", nivel: "avanzado", horas: 20, descripcion: "OWASP Top 10, headers HTTP, CSP, autenticación y manejo de secretos.", cupo: 20 },
  "0b7c1a2e00014c3a9d5e000000000004": { titulo: "Arquitecturas serverless", nivel: "avanzado", horas: 24, descripcion: "Funciones, contenedores gestionados, colas de mensajes y costos.", cupo: 20 },
  "0b7c1a2e00014c3a9d5e000000000005": { titulo: "React desde cero", nivel: "inicial", horas: 18, descripcion: "Componentes, estado, efectos y composición.", cupo: 40 },
  "0b7c1a2e00014c3a9d5e000000000006": { titulo: "Observabilidad y SRE", nivel: "intermedio", horas: 14, descripcion: "Logs estructurados, métricas, trazas, SLOs y alertas.", cupo: 25 },
  "0b7c1a2e00014c3a9d5e000000000007": { titulo: "Bases de datos relacionales", nivel: "intermedio", horas: 20, descripcion: "Modelado, normalización, índices, transacciones y SQL.", cupo: 30 },
};

export default function CursoDetalleCliente({ cursoId }: Props) {
  const curso = CURSOS[cursoId];

  if (!curso) {
    return <p className="hint">Curso no encontrado.</p>;
  }

  return (
    <section>
      <article className="curso-detalle">
        <span className={`badge badge--${curso.nivel}`}>{curso.nivel}</span>
        <h1>{curso.titulo}</h1>
        <p>{curso.descripcion}</p>
        <small>
          {curso.horas} horas · cupo {curso.cupo}
        </small>
      </article>
      <hr style={{ margin: "32px 0" }} />
      <ResenasCurso cursoId={cursoId} />
    </section>
  );
}