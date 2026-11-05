"use client";

import { useEffect, useState, type FormEvent } from "react";
import { escucharResenas, guardarResena, resumenDe, type Resena } from "@/lib/resenas";
import { useUsuario } from "@/lib/useUsuario";

interface Props {
  cursoId: string;
}

export default function ResenasCurso({ cursoId }: Props) {
  const usuario = useUsuario();
  const [resenas, setResenas] = useState<Resena[]>([]);
  const [resumen, setResumen] = useState<{ cantidad: number; promedio: number | null } | null>(null);
  const [soloCinco, setSoloCinco] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Suscripción en tiempo real: se cancela al desmontar o al cambiar de curso/filtro.
  useEffect(() => {
    return escucharResenas(cursoId, setResenas, (e) => setError(e.message), soloCinco);
  }, [cursoId, soloCinco]);

  useEffect(() => {
    resumenDe(cursoId).then(setResumen).catch((e: Error) => setError(e.message));
  }, [cursoId, resenas.length]); // recalcular cuando cambia la cantidad (no es en tiempo real)

  const mia = resenas.find((r) => r.uid === usuario?.uid);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await guardarResena(cursoId, Number(f.get("puntaje")), String(f.get("texto")), !mia);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (usuario === undefined) return <p className="hint">Verificando sesión…</p>;

  return (
    <section className="resenas">
      <h3>
        Reseñas
        {resumen && resumen.cantidad > 0 && ` · ★ ${resumen.promedio?.toFixed(1)} (${resumen.cantidad})`}
      </h3>
      <label className="filtro-cinco">
        <input
          type="checkbox"
          checked={soloCinco}
          onChange={(e) => setSoloCinco(e.target.checked)}
        />
        Solo 5 estrellas
      </label>
      {usuario && (
        <form onSubmit={onSubmit} className="resena-form">
          <select name="puntaje" defaultValue={mia?.puntaje ?? 5}>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {"★".repeat(n)}
              </option>
            ))}
          </select>
          <textarea name="texto" maxLength={500} defaultValue={mia?.texto ?? ""} required placeholder="Tu reseña…" />
          <button type="submit" className="button button--small">
            {mia ? "Actualizar mi reseña" : "Publicar"}
          </button>
        </form>
      )}
      {usuario === null && <p className="hint">Ingresá para dejar una reseña.</p>}
      {error && <p className="alerta alerta--error" role="alert">{error}</p>}
      <ul className="resenas-lista">
        {resenas.map((r) => (
          <li key={r.uid} className="resena-item">
            <strong>{"★".repeat(r.puntaje)}</strong> {r.texto} — <em>{r.autor}</em>
          </li>
        ))}
        {resenas.length === 0 && <li className="hint">Sin reseñas aún. ¡Sé el primero en opinar!</li>}
      </ul>
    </section>
  );
}