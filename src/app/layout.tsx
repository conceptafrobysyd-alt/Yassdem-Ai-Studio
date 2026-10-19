import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Yassdem AI Studio',
  description: 'Votre studio privé de création produit et fashion.',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
