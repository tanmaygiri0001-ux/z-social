import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import './logo.css';
import './friends.css';
import './stories.css';
import './inspired-layout.css';
import './reference-feed.css';
import './utilities.css';
import './loading.css';
import './profile-grid.css';
import './messaging-upgrades.css';
import './story-follow-media.css';
import './media-modal.css';
import './clean-social.css';
import './feed-line-fix.css';
import './avatar-studio.css';
import './post-detail.css';

createRoot(document.getElementById('root')).render(
  <StrictMode><App /></StrictMode>
);
