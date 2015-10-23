import { BaseDriver } from 'appium-base-driver';
import { fs } from 'appium-support';
import { installApp, launch } from 'node-simctl';
import WebDriverAgent from './webdriveragent';
import log from './logger';
import { simBooted, createSim } from './simulatorManagement.js';
import { killAllSimulators, getSimulator } from 'appium-ios-simulator';

class WebDriverAgentDriver extends BaseDriver {
  constructor (opts = {}, shouldValidateCaps = true) {
    super(opts, shouldValidateCaps);

    // TODO set up desired cap constraints
    //this.desiredCapConstraints = desiredCapConstraints;
    this.wda = null;
    this.sim = null;
    this.jwpProxyActive = false;
    this.proxyReqRes = null;
    this.jwpProxyAvoid = [];
  }

  get driverData () {
    // TODO fill out resource info here
    return {};
  }

  async createSession (caps) {
    try {
      // TODO add validation on caps
      // TODO handle otherSessionData for multiple sessions
      let sessionId;
      [sessionId] = await super.createSession(caps);
      // fail very early if the app doesn't actually exist
      await this.checkAppPresent();
      // TODO this port should be dynamically chosen based on driverData
      const port = 8105;

      // start sim, or use running sim
      log.info('starting simlator (if not booted)');
      this.sim = await this.startSim();

      this.wda = new WebDriverAgent({
        udid: this.sim.udid,
        platformVersion: this.opts.platformVersion,
        host: this.opts.host,
        port,
        agentPath: this.opts.agentPath
      });

      // TODO logic for launching the sim goes here or in WDA
      await this.wda.launch(sessionId);
      log.info("Installing the app");
      // TODO don't re-install?
      await installApp(this.sim.udid, this.opts.app);
      log.info("Launching the app");
      await launch(this.sim.udid, this.opts.bundleId);

      this.proxyReqRes = this.wda.proxyReqRes.bind(this.wda);
      this.jwpProxyActive = true;
      return [sessionId, caps];
    } catch (e) {
      await this.deleteSession();
      throw e;
    }
  }

  async deleteSession () {
    this.jwpProxyActive = false;
    this.proxyReqRes = null;
    // TODO kill the future WDA subproc
    await super.deleteSession();
  }

  async checkAppPresent () {
    log.debug("Checking whether app is actually present");
    if (!(await fs.exists(this.opts.app))) {
      log.errorAndThrow(`Could not find app at ${this.opts.app}`);
    }
  }

  async startSim () {
    let sim;
    // TODO for now just kill all sims unless specified udid is booted.
    // if booted, use it. if not booted, start it up
    // if no udid, well lets see if we can start one up based on desired caps
    // if we support multiple sims we need to change this
    if (this.opts.udid) {
      sim = await getSimulator(this.opts.udid);
      if (!await simBooted(this.opts.udid)) {
        log.info(`simulator with udid ${this.opts.udid} not booted. Booting up now`);
        await killAllSimulators();
        await sim.run();
      } else {
        log.info(`simulator ${this.opts.udid} already booted`);
      }
      return sim;
    }

    log.info(`simulator udid not provided, using desired caps to create a new sim`);

    // create sim for caps
    await killAllSimulators();
    sim = await createSim(this.caps, this.sessionId);
    log.info(`created simulator ${sim.udid}. Booting it up`);
    await sim.run();
    log.info(`simulator booted`);

    return sim;
  }

}

export { WebDriverAgentDriver };
