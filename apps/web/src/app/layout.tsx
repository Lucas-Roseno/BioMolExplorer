import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "BioMolExplorer",
  description: "Advanced Molecular Exploration",
  icons: {
    icon: "/img/icon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <Script src="https://3Dmol.org/build/3Dmol-min.js" strategy="beforeInteractive" />
        {/* A Mágica dos Ícones Antigos */}
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css" />
      </head>
      <body>
        <header className="main-header">
          <div className="header-content">
            <Link href="/" className="header-link-home">
              <img src="/img/icon.png" alt="Logo" className="header-logo" />
            </Link>
            <h1>BioMolExplorer</h1>
          </div>
          <nav className="main-nav">
            <ul>
              <li><Link href="/">Home</Link></li>
              <li><Link href="/pdb">PDB</Link></li>
              <li><Link href="/chembl">ChEMBL</Link></li>
              <li><Link href="/zinc">ZINC</Link></li>
            </ul>
          </nav>
        </header>

        {children}

        <footer className="site-footer">
          <div className="footer-inner">
            <div className="footer-left"><strong>BioMolExplorer</strong> · Version 2.0</div>
            <nav className="footer-links">
              <Link href="/about">About</Link>
              <Link href="#">References</Link>
              <Link href="#">Contact</Link>
            </nav>
            <div className="footer-right">Copyright © 2024 BioMolExplorer. All Rights Reserved.</div>
          </div>
        </footer>
      </body>
    </html>
  );
}