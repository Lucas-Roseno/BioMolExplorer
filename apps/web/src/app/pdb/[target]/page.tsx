'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import '../pdb.css';
import { API_BASE_URL } from '../../../config';

type CsvData = {
  headers: string[];
  rows: string[][];
};

export default function PdbCsvPage() {
  const params = useParams();
  const target = typeof params?.target === 'string' ? params.target : '';
  const [csvData, setCsvData] = useState<CsvData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [deletingRow, setDeletingRow] = useState<number | null>(null);

  const apiBase = API_BASE_URL || '';
  const csvFile = 'pdb_codes.csv';

  const fetchCsv = async () => {
    if (!target) return;
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${apiBase}/api/files/csv/PDB/${encodeURIComponent(target)}/${encodeURIComponent(csvFile)}`, {
        cache: 'no-store'
      });
      const data = await response.json();
      if (!response.ok || data.status === 'error') {
        setError(data.message || 'CSV file not found for this target.');
        setCsvData(null);
      } else {
        setCsvData({ headers: data.headers || [], rows: data.rows || [] });
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch CSV data.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRow = async (rowIndex: number, pdbCode: string) => {
    if (!target || deletingRow !== null) return;
    if (!confirm(`Delete this entry from the table? The PDB file will remain available.`)) return;

    setDeletingRow(rowIndex);
    try {
      const response = await fetch(`${apiBase}/api/files/csv/delete-row`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, csv_file: csvFile, row_index: rowIndex })
      });
      const data = await response.json();
      if (!response.ok || data.status === 'error') {
        alert(data.message || 'Failed to delete CSV row.');
      } else {
        await fetchCsv();
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to delete row.');
    } finally {
      setDeletingRow(null);
    }
  };

  const handleDownloadCsv = async () => {
    if (!target) return;

    try {
      const response = await fetch(`${apiBase}/api/files/download/PDB/csv/${encodeURIComponent(target)}/${encodeURIComponent(csvFile)}`);
      if (!response.ok) {
        throw new Error('Failed to download CSV file.');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = csvFile;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err?.message || 'Failed to download CSV file.');
    }
  };

  useEffect(() => {
    fetchCsv();
  }, [target]);

  // Refresh CSV data when window regains focus or periodically
  useEffect(() => {
    const handleFocus = () => {
      fetchCsv();
    };

    window.addEventListener('focus', handleFocus);
    
    // Also poll every 30 seconds to catch external changes
    const intervalId = setInterval(fetchCsv, 30000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      clearInterval(intervalId);
    };
  }, [target]);

  const getPdbLink = (code: string) => `https://www.rcsb.org/structure/${code}`;

  return (
    <div className="container">
      <h2 className="page-title csv-page-title">PDB CSV Table - {target || 'Unknown target'}</h2>
      <div className="pdb-flex-layout">
        <div className="pdb-list-container">
          <div className="page-actions">
            <Link href="/pdb" className="csv-back-btn">
              <i className="fas fa-arrow-left" aria-hidden="true"></i>
              <span>Back to PDB</span>
            </Link>
            <button type="button" className="csv-download-btn" onClick={handleDownloadCsv}>
              <i className="fas fa-file-csv" aria-hidden="true"></i>
              <span>Download CSV</span>
            </button>
          </div>

          <div className="csv-helper-text">
            Use the blue icon to open the selected PDB entry on the official RCSB PDB website.
          </div>
          {loading && <div className="empty-list-message">Loading CSV data...</div>}
          {!loading && error && <div className="empty-list-message">{error}</div>}
          {!loading && !error && csvData?.rows.length === 0 && (
            <div className="empty-list-message">No rows found in pdb_codes.csv.</div>
          )}

          {!loading && !error && csvData && csvData.rows.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table className="pdb-csv-table">
                <thead>
                  <tr>
                    {csvData.headers.map((header) => (
                      <th key={header}>{header}</th>
                    ))}
                    <th>Official PDB</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {csvData.rows.map((row, index) => {
                    const pdbCode = row[0] || '';
                    return (
                      <tr key={`${pdbCode}-${index}`}>
                        {row.map((value, cellIndex) => (
                          <td key={`${index}-${cellIndex}`}>{value}</td>
                        ))}
                        <td>
                          {pdbCode ? (
                            <a href={getPdbLink(pdbCode)} target="_blank" rel="noreferrer" className="open-pdb-btn" title="Open PDB">
                              <i className="fas fa-external-link-alt"></i>
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="delete-btn"
                            disabled={deletingRow === index}
                            onClick={() => handleDeleteRow(index, pdbCode)}
                            title="Delete row"
                          >
                            <i className="fas fa-trash-alt"></i>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
