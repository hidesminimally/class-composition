import React, { useEffect, useRef } from 'react';

const DataTable = ({ features, isExpanded, onToggleExpanded, sortKey, sortAsc, onSort, selectedId, onSelect, mobileActive }) => {
  const selectedRowRef = useRef(null);

  useEffect(() => {
    if (!selectedId || selectedId === 'AGGREGATE' || !isExpanded) return;
    selectedRowRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, [selectedId, isExpanded]);

  const getSortIcon = (key) =>
    sortKey !== key
      ? <span style={{opacity:0.3}}>↕</span>
      : (sortAsc ? '↑' : '↓');

  return (
    <div className={`table-section ${isExpanded ? 'expanded' : 'collapsed'} ${mobileActive ? 'mobile-active' : ''}`}>
      <div className="table-header" onClick={onToggleExpanded}>
        <span>DATA GRID</span><span>{features.length} rows</span>
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
            {features.map(f => {
              const r = f.properties;
              const isSel = selectedId === r.id;
              return (
                <tr
                  key={r.id}
                  ref={isSel ? selectedRowRef : null}
                  onClick={() => onSelect(f)}
                  className={isSel ? 'selected' : ''}
                >
                  <td>{r.tanc_local}</td><td>{r.id}</td>
                  <td>{r.rent_burden}%</td><td>{r.unemployment}%</td>
                  <td>{r.total_pop}</td><td>{r.pct_black}%</td>
                  <td>{r.pct_hispanic}%</td><td>{r.pct_asian}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DataTable;
