"use client";

import { useEffect, useState } from "react";
import { listarCursos } from "@/lib/sqlconnect";
import ResenasCurso from "@/app/components/ResenasCurso";
import { notFound } from "next/navigation";

interface Props {
  cursoId: string;
}

export default function CursoDetalleCliente({ cursoId }: Props) {
  const [curso, setCurso] = useState<{ id: string; titulo: string; nivel: string; horas: number; descripcion: string; cupo: number } | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    listarCursos()
      .then((cursos) => {
        const encontrado = cursos.find((c) => c.id === cursoId);
        if (encontrado) setCurso(encontrado);
        else notFound();
      })
      .finally(() => setCargando(false));
  }, [cursoId]);

  if (cargando) return <p className="hint">Cargando curso…</p>;
  if (!curso) return null;

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