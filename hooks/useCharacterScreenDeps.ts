import { useAppNavigation } from '../context/AppContext';
import { useCharacter } from '../context/CharacterContext';
import { useConfig } from '../context/ConfigContext';
import { useAddToast } from '../context/NotificationContext';
import { useOSPersonalization } from '../context/OSContext';

export function useCharacterScreenDeps() {
    const { closeApp, openApp } = useAppNavigation();
    const {
        addCharacter,
        characters,
        deleteCharacter,
        setActiveCharacterId,
        setCharacters,
        setWorldbooks,
        updateCharacter,
        worldbooks,
    } = useCharacter();
    const { apiConfig } = useConfig();
    const addToast = useAddToast();
    const { addCustomTheme, customThemes, userProfile } = useOSPersonalization();

    return {
        addCharacter,
        addCustomTheme,
        addToast,
        apiConfig,
        characters,
        closeApp,
        customThemes,
        deleteCharacter,
        openApp,
        setActiveCharacterId,
        setCharacters,
        setWorldbooks,
        updateCharacter,
        userProfile,
        worldbooks,
    };
}
