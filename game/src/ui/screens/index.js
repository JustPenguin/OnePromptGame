// Screen registry: add a screen = import it here, add it to SCREENS, add its css to SCREEN_CSS.  OWNER: Agent E.
import { TitleScreen, titleCss } from './title.js';
import { MainMenuScreen, menuCss } from './menu.js';
import { LoadingScreen, loadingCss } from './loading.js';
import { PauseScreen, pauseCss } from './pause.js';
import { ResultsScreen, resultsCss } from './results.js';
import { DriverScreen, KartScreen, ClassScreen, selectCss } from './select.js';
import { CupScreen, TrackScreen, cupsCss } from './cups.js';
import { VersusSetupScreen, vsetupCss } from './vsetup.js';
import { StandingsScreen, PodiumScreen, gpCss } from './gp.js';
import { SettingsScreen, settingsCss } from './settings.js';
import { RecordsScreen, recordsCss } from './records.js';
import { HelpScreen, helpCss } from './help.js';
import { trackCardCss } from '../trackCard.js';
import { previewCss } from '../hud/preview.js';

export const SCREENS = {
  title: TitleScreen,
  menu: MainMenuScreen,
  loading: LoadingScreen,
  pause: PauseScreen,
  results: ResultsScreen,
  driver: DriverScreen,
  kart: KartScreen,
  class: ClassScreen,
  cup: CupScreen,
  track: TrackScreen,
  vsetup: VersusSetupScreen,
  standings: StandingsScreen,
  podium: PodiumScreen,
  settings: SettingsScreen,
  records: RecordsScreen,
  help: HelpScreen,
};

export const SCREEN_CSS = [titleCss, menuCss, loadingCss, pauseCss, resultsCss, trackCardCss, selectCss, cupsCss, vsetupCss, gpCss, settingsCss, previewCss, recordsCss, helpCss];
