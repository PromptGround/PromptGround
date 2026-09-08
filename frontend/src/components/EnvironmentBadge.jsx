import React from 'react';

export default function EnvironmentBadge({ env = 'development', size = 'md' }) {
  const norm = (env || 'development').toLowerCase();

  let badgeClass = 'badge-dev';
  let label = 'DEVELOPMENT';

  if (norm === 'staging') {
    badgeClass = 'badge-stg';
    label = 'STAGING';
  } else if (norm === 'production') {
    badgeClass = 'badge-prod';
    label = 'PRODUCTION';
  }

  const paddingStyle = size === 'sm' ? { padding: '2px 7px', fontSize: '0.68rem' } : {};

  return (
    <span className={`badge-env ${badgeClass}`} style={paddingStyle}>
      <span className="pulse-dot" />
      {label}
    </span>
  );
}
