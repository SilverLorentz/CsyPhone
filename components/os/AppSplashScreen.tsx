import React from 'react';
import type { AppID } from '../../types';
import PhoneSplashPoem from './PhoneSplashPoem';

interface AppSplashScreenProps {
    appId: AppID | null;
}

const AppSplashScreen: React.FC<AppSplashScreenProps> = ({ appId: _appId }) => (
    <div className="phone-splash-poem-shell">
        <PhoneSplashPoem />
    </div>
);

export default AppSplashScreen;
