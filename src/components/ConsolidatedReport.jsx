import React from 'react';
import FactSheet from './FactSheet';

const ConsolidatedReport = ({ locals, onClose, dataFunc, allFeatures = [] }) => {
  const reports = locals.map(local => dataFunc(local)).filter(Boolean);

  return (
    <div className="report-modal">
      <div className="report-controls">
        <button className="btn-primary" onClick={() => window.print()}>Print / Save PDF</button>
        <button className="btn-secondary" onClick={onClose}>Close</button>
      </div>
      <div className="report-container">
        {reports.map((stats, i) => (
          <div key={i} className="report-page">
            <FactSheet p={stats} allFeatures={allFeatures} />
          </div>
        ))}
      </div>
    </div>
  );
};

export default ConsolidatedReport;
