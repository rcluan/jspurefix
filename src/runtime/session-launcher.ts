import * as path from 'path'
import { IJsFixConfig, IJsFixLogger, JsFixLoggerFactory, JsFixWinstonLogFactory, WinstonLogger } from '../config'
import { ISessionDescription, FixEntity, FixSession } from '../transport'
import { DependencyContainer } from 'tsyringe'
import { EngineFactory } from './engine-factory'
import { SessionContainer } from './session-container'
import { DITokens } from './di-tokens'

const defaultLoggerFactory = new JsFixWinstonLogFactory(WinstonLogger.consoleOptions('info'))

export abstract class SessionLauncher {
  public root: string = '../../'
  protected readonly logger: IJsFixLogger
  public readonly initiatorConfig: ISessionDescription
  public readonly acceptorConfig: ISessionDescription | null
  protected constructor (initiatorConfig: string | ISessionDescription,
    acceptorConfig: string | ISessionDescription | null = null,
    private readonly loggerFactory: JsFixLoggerFactory = defaultLoggerFactory) {
    this.logger = this.loggerFactory.logger('launcher')
    this.initiatorConfig = this.loadConfig(initiatorConfig)
    this.acceptorConfig = acceptorConfig ? this.loadConfig(acceptorConfig) : null
  }

  protected sessionContainer: SessionContainer = new SessionContainer()

  private async empty (): Promise<any> {
    return await new Promise((resolve, reject) => {
      try {
        setImmediate(() => {
          this.logger.info('resolving an empty promise')
          resolve(null)
        })
      } catch (e) {
        reject(e)
      }
    })
  }

  protected async getAcceptor (sessionContainer: DependencyContainer): Promise<any> {
    if (sessionContainer.isRegistered<FixEntity>(DITokens.FixEntity)) {
      const entity = sessionContainer.resolve<FixEntity>(DITokens.FixEntity)
      return entity.start()
    } else {
      return this.empty()
    }
  }

  protected async getInitiator (sessionContainer: DependencyContainer): Promise<any> {
    if (sessionContainer.isRegistered<FixEntity>(DITokens.FixEntity)) {
      const entity = sessionContainer.resolve<FixEntity>(DITokens.FixEntity)
      return entity.start()
    } else {
      return this.empty()
    }
  }

  protected makeFactory (config: IJsFixConfig): EngineFactory | null {
    return null
  }

  public async run (): Promise<boolean> {
    return await new Promise<any>((resolve, reject) => {
      const logger = this.logger
      logger.info('launching ..')
      this.setup().then(() => {
        logger.info('.. done')
        resolve(true)
      }).catch((e: Error) => {
        logger.error(e)
        reject(e)
      })
    })
  }

  public exec (): void {
    this.run().then(() => {
      console.log('finished.')
    }).catch(e => {
      console.error(e)
    })
  }

  public isAscii (description: ISessionDescription): boolean {
    return this.sessionContainer.isAscii(description)
  }

  public isInitiator (description: ISessionDescription): boolean {
    return this.sessionContainer.isInitiator(description)
  }

  protected registerApplication (sessionContainer: DependencyContainer): void {
    this.logger.info('bypass register via DI')
  }

  private async makeSystem (description: ISessionDescription): Promise<DependencyContainer> {
    const name = description.application?.name ?? 'na'
    const protocol = description.application?.protocol ?? 'ascii'
    this.logger.info(`creating app ${name} [protocol ${protocol}]`)
    return await this.sessionContainer.makeSystem(description)
  }

  private register (container: DependencyContainer): void {
    const config = container.resolve<IJsFixConfig>(DITokens.IJsFixConfig)
    const factory = this.makeFactory(config)
    if (!factory) {
      this.registerApplication(container)
    } else {
      if (factory.makeSession) {
        container.register<FixSession>(DITokens.FixSession, {
          useFactory: () => factory.makeSession(config)
        })
      }
    }
  }

  private async makeClient (): Promise<any> {
    const sessionContainer = await this.makeSystem(this.initiatorConfig)
    this.register(sessionContainer)
    this.logger.info('create initiator')
    return await this.getInitiator(sessionContainer)
  }

  private async makeServer (): Promise<any> {
    if (!this.acceptorConfig) return
    const sessionContainer = await this.makeSystem(this.acceptorConfig)
    this.register(sessionContainer)
    this.logger.info('create acceptor')
    return await this.getAcceptor(sessionContainer)
  }

  async serverOrEmpty (): Promise<any> {
    const server = this.acceptorConfig ? this.makeServer() : this.empty()
    return server
  }

  async clientOrEmpty (): Promise<any> {
    const client = this.initiatorConfig ? this.makeClient() : this.empty()
    return client
  }

  private async setup (): Promise<any> {
    this.sessionContainer.registerGlobal(this.loggerFactory)
    const server = this.serverOrEmpty()
    const client = this.clientOrEmpty()
    this.logger.info('launching ....')
    return await Promise.all([server, client])
  }

  private loadConfig (config: string | ISessionDescription): ISessionDescription {
    if (typeof config === 'string') {
      return require(path.join(this.root, config))
    }
    return config
  }
}
