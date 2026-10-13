/** Layout sin navegación para documentos imprimibles (remitos, tickets, presupuestos). */
export default function PrintLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="min-h-screen bg-white py-6 print:py-0">{children}</div>;
}
