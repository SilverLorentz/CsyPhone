/**
 * ProfileTab — Settings: basic info, goals, body info toggle
 */
import React from 'react';
import { useHalfSugar } from '../HalfSugarContext';
import { OnboardingView } from '../HalfSugarTrackingUI';

const ProfileTab: React.FC = () => {
    const {
        healthProfile, onboardingGoalState, isSettingsSaving,
        handleOnboardingComplete, userProfile, goals,
    } = useHalfSugar();

    return (
        <div className="hs-tab-content no-scrollbar">
            <OnboardingView
                initialProfile={healthProfile}
                initialGoals={onboardingGoalState}
                initialShareBodyInfo={(userProfile as any).healthShareBodyInfo === true}
                hasPersistedGoals={goals.length > 0}
                isSaving={isSettingsSaving}
                onComplete={handleOnboardingComplete}
            />
        </div>
    );
};

export default ProfileTab;
