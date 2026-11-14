import type { ReactNode } from 'react'

/** Sello de lacre: marca visual de todo lo que es solo para el máster. */
export function Sello({ tamano = 18, titulo }: { tamano?: number; titulo?: string }) {
  return (
    <svg
      className="sello"
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      role={titulo ? 'img' : undefined}
      aria-hidden={titulo ? undefined : true}
      aria-label={titulo}
    >
      <path
        fill="currentColor"
        d="M12 1.5l2.1 1.6 2.6-.4 1.1 2.4 2.4 1.1-.4 2.6 1.6 2.1-1.6 2.1.4 2.6-2.4 1.1-1.1 2.4-2.6-.4L12 22.5l-2.1-1.6-2.6.4-1.1-2.4-2.4-1.1.4-2.6L2.6 13.1 4.2 11l-.4-2.6 2.4-1.1 1.1-2.4 2.6.4z"
      />
      <circle cx="12" cy="12" r="5.2" fill="none" stroke="var(--lacre-fondo)" strokeWidth="1.4" />
      <path d="M9.6 12.6l1.6 1.5 3.3-3.6" fill="none" stroke="var(--lacre-fondo)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Bloque sellado: contenedor de un campo secreto. */
export function BloqueSellado({ etiqueta, htmlFor, ayuda, children }: { etiqueta: string; htmlFor?: string; ayuda?: string; children: ReactNode }) {
  return (
    <div className="sellado">
      <div className="sellado-cabecera">
        <Sello />
        <label htmlFor={htmlFor}>{etiqueta}</label>
        <span className="sellado-nota">Solo máster</span>
      </div>
      {ayuda && <p className="ayuda">{ayuda}</p>}
      <div className="sellado-contenido">{children}</div>
    </div>
  )
}
