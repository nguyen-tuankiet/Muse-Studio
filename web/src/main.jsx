import React from 'react';
import { createRoot } from 'react-dom/client';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import 'dayjs/locale/vi';
import App from './App.jsx';
import './index.css';

dayjs.extend(customParseFormat);
dayjs.locale('vi');

createRoot(document.getElementById('root')).render(<App />);
