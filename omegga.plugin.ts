import OmeggaPlugin, { OL, PS, PC, OmeggaPlayer } from 'omegga';

type Config = { muteRole: string, canMute: string, interval: number };
type Storage = { muted_times: Object[] };

const DS_KEY = 'muted_times';

function deconstructArgs(args: string[]): string[] {
  let results: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const current = args[i];

    if (current.match(/^['"]/)) {
      let gathered = [];
      gathered.push(current);

      for (let j = i + 1; j < args.length; j++) {
        const nested = args[j];
        gathered.push(nested);

        if (nested.match(/['"]$/)) {
          i = j;
          const stringified = gathered.toString().replace(/^['"]|['"]$/g, '').replace(/,/g, ' ');
          results.push(stringified);
          break;
        }
      }
    } else results.push(current);
  }

  return results;
}

export default class Plugin implements OmeggaPlugin<Config, Storage> {
  omegga: OL;
  config: PC<Config>;
  store: PS<Storage>;

  constructor(omegga: OL, config: PC<Config>, store: PS<Storage>) {
    this.omegga = omegga;
    this.config = config;
    this.store = store;
  }

  public currentlyMuted: Object;
  private canMuteRoles: string[];

  // Checks if a player has a role that can mute
  private canUseCommand(plr: OmeggaPlayer): boolean {
    if (plr.isHost()) return true;
    let canUse = false;

    const plrRoles = plr.getRoles();

    return this.canMuteRoles.some(R => plrRoles.includes(R));
  }

  // Creates a new mute
  private newMute(plr: OmeggaPlayer, mutedAt: number, muteLength: number): boolean {
    if (this.currentlyMuted.hasOwnProperty(plr.name)) return false;

    const _new = {
      key: plr.name,
      playerID: plr.id,
      muteStart: mutedAt,
      length: muteLength
    }

    this.currentlyMuted[plr.name] = _new;
    return true;
  }

  // Interval variable and function for checking mute status
  private INTERVAL;
  public checkMutedPlayers() {
    const intervalTime = Date.now();
    for (const [k, v] of Object.entries(this.currentlyMuted) ) {
      if ((intervalTime - v.muteStart) >= (v.length * 1000)) {
        this.omegga.writeln(`Chat.Command /RevokeRole "${this.config.muteRole}" "${v.playerID}"`);

        delete this.currentlyMuted[k];
      }
    }
  }

  async init() {
    this.canMuteRoles = this.config.canMute.split(',');
    this.currentlyMuted = await this.store.get(DS_KEY)[0] || {}

    this.INTERVAL = setInterval(this.checkMutedPlayers.bind(this), this.config.interval * 1000);

    // Commands
    this.omegga.on('cmd:mute', (speaker: string, ...args: string[]) => {
      const plr = this.omegga.getPlayer(speaker);
      if (!this.canUseCommand(plr)) {
        this.omegga.whisper(plr, 'You do not have permission to use this command.');
        return;
      }

      if (!args || args.length <= 0) {
        this.omegga.whisper(plr, 'Invalid number of arguments!');
      }

      const decon = deconstructArgs(args);
      if (decon.length != 2) {
        this.omegga.whisper(plr, 'Invalid number of arguments.');
      }

      const [checkName, L] = decon;

      const length = parseInt(L);
      if (!length) {
        this.omegga.whisper(plr, `${L} is not a valid number.`);
        return;
      }

      const plrToMute = this.omegga.findPlayerByName(checkName);

      if (!plrToMute) {
        this.omegga.whisper(plr, `Unable to find player ${checkName}.`);
        return;
      }

      if (this.newMute(plrToMute, Date.now(), length)) {
        this.omegga.writeln(`Chat.Command /GrantRole "${this.config.muteRole}" "${plrToMute.name}`);
      } else this.omegga.whisper(plr, 'Player already muted.');
    });

    this.omegga.on('cmd:unmute', (speaker: string, ...plr: string[]) => {
      if (!plr || plr.length <= 0) {
        this.omegga.whisper(speaker, 'Invalid number of arguments!');
      }

      const checkName = plr.toString().replace(',', ' ');
      const plrToMute = this.omegga.findPlayerByName(checkName);

      if (!plrToMute) {
        this.omegga.whisper(speaker, `Unable to find player ${checkName}.`);
        return;
      }

      if (this.currentlyMuted.hasOwnProperty(plrToMute.name)) {
        delete this.currentlyMuted[plrToMute.name];

        this.omegga.writeln(`Chat.Command /RevokeRole "${this.config.muteRole}" "${plrToMute.name}"`);
      }

    });

    return { registeredCommands: ['mute', 'unmute'] };
  }

  async stop() {
    clearInterval(this.INTERVAL);
    this.store.set(DS_KEY, [this.currentlyMuted]);
  }
}
