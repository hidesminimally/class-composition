import React from 'react';

const DataTable = ({ rows, isExpanded, onToggleExpanded, sortKey, sortAsc, onSort, selectedId, onSelect, mobileActive }) => {
  const getSortIcon = (key) =>
    sortKey !== key
      ? <span style={{opacity:0.3}}>↕</span>
      : (sortAsc ? '↑' : '↓');

  return (
    <div className={`table-section ${isExpanded ? 'expanded' : 'collapsed'} ${mobileActive ? 'mobile-active' : ''}`}>
      <div className="table-header" onClick={onToggleExpanded}>
        <span>DATA GRID</span><span>{rows.length} rows</span>
      </div>
      <div className="table-content">
        <table>
          <thead>
            <tr>
              <th onClick={() => onSort('tanc_local')}>Local {getSortIcon('tanc_local')}</th>
              <th onClick={() => onSort('id')}>ID {getSortIcon('id')}</th>
              <th onClick={() => onSort('rent_burden')}>Burden {getSortIcon('rent_burden')}</th>
              <th onClick={() => onSort('unemployment')}>Unemp {getSortIcon('unemployment')}</th>
              <th>Pop</th><th>Blk</th><th>Hisp</th><th>Asn</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr
                key={r.id}
                onClick={() => onSelect({properties:r, geometry:{coordinates:[[[-122,37]]]}})}
                className={selectedId === r.id ? 'selected' : ''}
              >
                <td>{r.tanc_local}</td><td>{r.id}</td>
                <td>{r.rent_burden}%</td><td>{r.unemployment}%</td>
                <td>{r.total_pop}</td><td>{r.pct_black}%</td>
                <td>{r.pct_hispanic}%</td><td>{r.pct_asian}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DataTable;
