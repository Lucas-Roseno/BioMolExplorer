import Link from 'next/link';

export default function ContactPage() {
  const contacts = [
    { name: "Alex Gutterres Taranto", email: "alex@alex.org" },
    { name: "Alisson Marques da Silva", email: "alisson@cefetmg.br" },
    { name: "Michel Pires da Silva", email: "michel@cefetmg.br" },
    { name: "Lucas Roseno Medeiros Araujo", email: "lucas.araujo5938@gmail.com" },
    { name: "Pedro Henrique Pires Dias", email: "pedro.dias@aluno.cefetmg.br" }
  ];

  return (
    <div className="container">
      <div className="welcome-section">
        <h2 className="page-title">Contact Us</h2>
        <p>Feel free to reach out to our team members for any inquiries regarding the BioMolExplorer project.</p>
      </div>

      <div style={{ maxWidth: '600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {contacts.map((contact, index) => (
          <div key={index} style={{ 
            background: 'white', 
            padding: '1.5rem', 
            borderRadius: '10px', 
            boxShadow: '0 4px 10px rgba(0,0,0,0.05)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <strong style={{ color: '#47366d' }}>{contact.name}</strong>
            <Link href={`mailto:${contact.email}`} style={{ 
              color: '#9686de', 
              textDecoration: 'none',
              fontWeight: '600'
            }}>
              {contact.email}
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
