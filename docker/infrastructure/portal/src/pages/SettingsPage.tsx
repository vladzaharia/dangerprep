import React from 'react';

export const SettingsPage: React.FC = () => {
  return (
    <div className='wa-stack wa-gap-xl'>
      <h2>Settings</h2>
      <wa-callout size='large' appearance='outlined filled'>
        <div className='wa-stack wa-gap-m'>
          <p>Settings and configuration options will be available here.</p>
          <p>This page is currently under development.</p>
        </div>
      </wa-callout>
    </div>
  );
};
