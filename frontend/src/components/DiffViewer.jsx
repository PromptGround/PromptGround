import React, { useState } from 'react';
import { Columns, AlignLeft } from 'lucide-react';

export default function DiffViewer({ diff = [], originalContent = '', proposedContent = '', targetEnv = 'staging' }) {
  const [viewMode, setViewMode] = useState('unified'); // 'unified' | 'split'

  const oldLines = (originalContent || '').split('\n');
  const newLines = (proposedContent || '').split('\n');
  const maxLineCount = Math.max(oldLines.length, newLines.length);

  return (
    <div className="diff-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Inspection Mode:</span>
          <div style={{ display: 'flex', background: 'var(--bg-elevated)', borderRadius: '6px', padding: '2px', border: '1px solid var(--border-subtle)' }}>
            <button
              onClick={() => setViewMode('unified')}
              className={`btn btn-sm ${viewMode === 'unified' ? 'btn-primary' : ''}`}
              style={{ background: viewMode === 'unified' ? '' : 'transparent', border: 'none', padding: '4px 10px', fontSize: '0.75rem' }}
            >
              <AlignLeft size={13} style={{ marginRight: '4px' }} /> Unified
            </button>
            <button
              onClick={() => setViewMode('split')}
              className={`btn btn-sm ${viewMode === 'split' ? 'btn-primary' : ''}`}
              style={{ background: viewMode === 'split' ? '' : 'transparent', border: 'none', padding: '4px 10px', fontSize: '0.75rem' }}
            >
              <Columns size={13} style={{ marginRight: '4px' }} /> Side-by-Side
            </button>
          </div>
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Comparing active <span style={{ color: '#fbbf24', fontWeight: 600 }}>{targetEnv}</span> vs proposed source
        </div>
      </div>

      {viewMode === 'unified' ? (
        <div className="diff-container">
          <div className="diff-header">
            <span style={{ width: '48px', textAlign: 'right', paddingRight: '12px' }}>OLD</span>
            <span style={{ width: '48px', textAlign: 'right', paddingRight: '12px' }}>NEW</span>
            <span style={{ width: '28px', textAlign: 'center' }}>+/-</span>
            <span style={{ flex: 1, paddingLeft: '12px' }}>TEMPLATE LINE CHANGES</span>
          </div>
          {diff.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No changes detected between versions.
            </div>
          ) : (
            diff.map((item, idx) => {
              const isAdded = item.type === 'added';
              const isRemoved = item.type === 'removed';
              const rowClass = isAdded ? 'diff-row-added' : (isRemoved ? 'diff-row-removed' : 'diff-row-unchanged');
              const sign = isAdded ? '+' : (isRemoved ? '-' : ' ');

              return (
                <div key={idx} className={`diff-row ${rowClass}`}>
                  <div className="diff-gutter">{item.oldLineNumber || ''}</div>
                  <div className="diff-gutter">{item.newLineNumber || ''}</div>
                  <div className="diff-sign">{sign}</div>
                  <div className="diff-content">{item.content || ' '}</div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* Side by Side Mode */
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div className="diff-container">
            <div className="diff-header" style={{ color: '#fca5a5' }}>
              CURRENT {targetEnv.toUpperCase()} ACTIVE
            </div>
            {oldLines.length === 0 || !originalContent ? (
              <div style={{ padding: '20px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                (No prior version deployed in {targetEnv})
              </div>
            ) : (
              oldLines.map((line, idx) => {
                const isDifferent = line !== newLines[idx];
                return (
                  <div key={idx} className={`diff-row ${isDifferent ? 'diff-row-removed' : 'diff-row-unchanged'}`}>
                    <div className="diff-gutter">{idx + 1}</div>
                    <div className="diff-content">{line || ' '}</div>
                  </div>
                );
              })
            )}
          </div>

          <div className="diff-container">
            <div className="diff-header" style={{ color: '#6ee7b7' }}>
              PROPOSED SOURCE VERSION
            </div>
            {newLines.map((line, idx) => {
              const isDifferent = line !== oldLines[idx];
              return (
                <div key={idx} className={`diff-row ${isDifferent ? 'diff-row-added' : 'diff-row-unchanged'}`}>
                  <div className="diff-gutter">{idx + 1}</div>
                  <div className="diff-content">{line || ' '}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
