import React from 'react';
import { METRICS } from '../config/metrics';

const Card = ({ p, metric, isPinned, onClick, onFactSheet }) => {
  if (isPinned) {
    return (
      <div className="stat-card pinned">
        <div className="pinned-left">
          <h3>{p.tanc_local}</h3><span>Tract {p.id}</span>
        </div>
        <div className="pinned-right">
          <div className="pinned-metric" style={{color: METRICS[metric].color}}>{p[metric]}%</div>
          <button className="pinned-btn" onClick={(e) => { e.stopPropagation(); onFactSheet(); }}>Sheet</button>
          <button onClick={onClick} style={{background:'none', border:'none', fontSize:'1.2rem', cursor:'pointer', color:'#94a3b8'}}>×</button>
        </div>
      </div>
    );
  }
  return (
    <div className="stat-card" onClick={onClick}>
      <div className="card-top">
        <div><div className="card-title">{p.tanc_local}</div><div className="card-sub">Tract {p.id}</div></div>
        <div className="card-val" style={{color: METRICS[metric].color}}>{p[metric]}%</div>
      </div>
      <div className="card-grid">
        <div><b>{p.total_pop}</b> Pop</div><div><b>{p.unemployment}%</b> Unemp</div><div><b>{p.rent_burden}%</b> Burden</div>
      </div>
      <div className="mini-bar">
        <div style={{width:`${p.pct_black}%`, background:'#ea580c'}} /><div style={{width:`${p.pct_hispanic}%`, background:'#16a34a'}} /><div style={{width:`${p.pct_asian}%`, background:'#9333ea'}} /><div style={{flex:1, background:'#e2e8f0'}} />
      </div>
    </div>
  );
};

export default Card;
