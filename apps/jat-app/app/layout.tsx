import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'JATapp — MotoJAT Enterprise Logistics Platform',
  description: 'Plataforma de transformación digital y gestión logística express para MotoJAT',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark">
      <body className="bg-[#0F172A] text-slate-100 antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
