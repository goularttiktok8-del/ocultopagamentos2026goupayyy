import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Oculto Pagamentos',
  description: 'Receba, acompanhe e saque seus valores com simplicidade.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
