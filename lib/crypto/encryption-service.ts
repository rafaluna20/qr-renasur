import { AES, enc, lib, PBKDF2 } from 'crypto-js';
import { globalLogger } from '../observability/structured-logger';

/**
 * Servicio de encriptación para proteger datos sensibles en almacenamiento local
 * Utiliza AES-256 con derivación de clave PBKDF2
 */
export class EncryptionService {
  private masterKey: string | null = null;
  private static instance: EncryptionService;
  
  // Constantes de seguridad
  private readonly PBKDF2_ITERATIONS = 10000;
  private readonly KEY_SIZE = 256 / 32; // 256 bits
  private readonly SALT = 'obra-cuaderno-salt-v1'; // En producción: generar por usuario

  private constructor() {
    // Singleton pattern
  }

  /**
   * Obtiene la instancia singleton
   */
  static getInstance(): EncryptionService {
    if (!EncryptionService.instance) {
      EncryptionService.instance = new EncryptionService();
    }
    return EncryptionService.instance;
  }

  /**
   * Inicializa el servicio con las credenciales del usuario
   * Debe llamarse después del login
   */
  async initialize(userId: string, deviceId?: string): Promise<void> {
    try {
      const device = deviceId || (await this.getDeviceFingerprint());
      const serverSecret = this.getServerSecret();

      // Derivar clave maestra usando PBKDF2
      this.masterKey = PBKDF2(
        `${userId}:${device}:${serverSecret}`,
        this.SALT,
        {
          keySize: this.KEY_SIZE,
          iterations: this.PBKDF2_ITERATIONS,
        }
      ).toString();

      globalLogger.info('Servicio de encriptación inicializado', {
        userId,
        hasKey: !!this.masterKey,
      });
    } catch (error: any) {
      globalLogger.error('Error inicializando encriptación', error);
      throw new Error('No se pudo inicializar el servicio de encriptación');
    }
  }

  /**
   * Encripta datos usando AES-256
   */
  async encrypt(data: any): Promise<string> {
    if (!this.masterKey) {
      throw new Error('Servicio de encriptación no inicializado. Llama a initialize() primero.');
    }

    try {
      const jsonStr = JSON.stringify(data);
      const encrypted = AES.encrypt(jsonStr, this.masterKey).toString();
      return encrypted;
    } catch (error: any) {
      globalLogger.error('Error encriptando datos', error);
      throw new Error('Error al encriptar datos');
    }
  }

  /**
   * Desencripta datos
   */
  async decrypt<T = any>(encrypted: string): Promise<T> {
    if (!this.masterKey) {
      throw new Error('Servicio de encriptación no inicializado. Llama a initialize() primero.');
    }

    try {
      const decrypted = AES.decrypt(encrypted, this.masterKey);
      const jsonStr = decrypted.toString(enc.Utf8);
      
      if (!jsonStr) {
        throw new Error('Datos corruptos o clave incorrecta');
      }
      
      return JSON.parse(jsonStr) as T;
    } catch (error: any) {
      globalLogger.error('Error desencriptando datos', error);
      throw new Error('Error al desencriptar datos. Posiblemente datos corruptos.');
    }
  }

  /**
   * Encripta una imagen/foto en base64
   */
  async encryptPhoto(base64: string): Promise<string> {
    if (!this.masterKey) {
      throw new Error('Servicio de encriptación no inicializado');
    }

    try {
      // Para fotos grandes, encriptar por chunks para mejor performance
      const CHUNK_SIZE = 100000; // 100KB por chunk
      
      if (base64.length <= CHUNK_SIZE) {
        return AES.encrypt(base64, this.masterKey).toString();
      }

      // Encriptación por chunks
      const chunks: string[] = [];
      for (let i = 0; i < base64.length; i += CHUNK_SIZE) {
        const chunk = base64.substring(i, i + CHUNK_SIZE);
        const encryptedChunk = AES.encrypt(chunk, this.masterKey).toString();
        chunks.push(encryptedChunk);
      }

      // Guardar metadata de chunks
      return JSON.stringify({
        type: 'chunked',
        chunks,
        chunkSize: CHUNK_SIZE,
      });
    } catch (error: any) {
      globalLogger.error('Error encriptando foto', error);
      throw new Error('Error al encriptar foto');
    }
  }

  /**
   * Desencripta una foto
   */
  async decryptPhoto(encrypted: string): Promise<string> {
    if (!this.masterKey) {
      throw new Error('Servicio de encriptación no inicializado');
    }

    try {
      // Detectar si es chunked
      if (encrypted.startsWith('{')) {
        const metadata = JSON.parse(encrypted);
        
        if (metadata.type === 'chunked') {
          // Desencriptar chunks
          const decryptedChunks = metadata.chunks.map((chunk: string) => {
            const decrypted = AES.decrypt(chunk, this.masterKey!);
            return decrypted.toString(enc.Utf8);
          });
          
          return decryptedChunks.join('');
        }
      }

      // Encriptación simple
      const decrypted = AES.decrypt(encrypted, this.masterKey);
      return decrypted.toString(enc.Utf8);
    } catch (error: any) {
      globalLogger.error('Error desencriptando foto', error);
      throw new Error('Error al desencriptar foto');
    }
  }

  /**
   * Genera un hash SHA-256 para integridad
   */
  async generateHash(data: string): Promise<string> {
    try {
      const msgUint8 = new TextEncoder().encode(data);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch (error: any) {
      globalLogger.error('Error generando hash', error);
      throw new Error('Error al generar hash');
    }
  }

  /**
   * Verifica la integridad de datos usando hash
   */
  async verifyIntegrity(data: string, expectedHash: string): Promise<boolean> {
    try {
      const actualHash = await this.generateHash(data);
      return actualHash === expectedHash;
    } catch (error: any) {
      globalLogger.error('Error verificando integridad', error);
      return false;
    }
  }

  /**
   * Obtiene o genera un device fingerprint único
   */
  private async getDeviceFingerprint(): Promise<string> {
    try {
      // Intentar obtener del localStorage
      const stored = localStorage.getItem('device_fingerprint');
      if (stored) return stored;

      // Generar nuevo fingerprint basado en características del dispositivo
      const components = [
        navigator.userAgent,
        navigator.language,
        new Date().getTimezoneOffset().toString(),
        screen.width + 'x' + screen.height,
        screen.colorDepth.toString(),
        navigator.hardwareConcurrency?.toString() || '0',
      ];

      const fingerprint = await this.generateHash(components.join('|'));
      
      // Guardar para uso futuro
      localStorage.setItem('device_fingerprint', fingerprint);
      
      return fingerprint;
    } catch (error: any) {
      globalLogger.warn('Error generando device fingerprint, usando fallback', {
        error: error.message,
      });
      
      // Fallback: generar ID aleatorio
      const fallback = crypto.randomUUID();
      localStorage.setItem('device_fingerprint', fallback);
      return fallback;
    }
  }

  /**
   * Obtiene el server secret (en producción debería venir del servidor)
   */
  private getServerSecret(): string {
    // En producción, esto debería venir de una variable de entorno o del servidor
    // durante el proceso de autenticación
    return process.env.NEXT_PUBLIC_ENCRYPTION_SECRET || 'default-secret-change-in-production';
  }

  /**
   * Limpia las claves de la memoria (llamar al hacer logout)
   */
  clear(): void {
    this.masterKey = null;
    globalLogger.info('Servicio de encriptación limpiado');
  }

  /**
   * Verifica si el servicio está inicializado
   */
  isInitialized(): boolean {
    return this.masterKey !== null;
  }

  /**
   * Rota la clave maestra (útil después de cambio de contraseña)
   */
  async rotateKey(newUserId: string, oldData: any[]): Promise<any[]> {
    if (!this.masterKey) {
      throw new Error('Servicio de encriptación no inicializado');
    }

    try {
      globalLogger.info('Iniciando rotación de claves', { itemCount: oldData.length });

      // Desencriptar con clave antigua
      const decrypted = await Promise.all(
        oldData.map((item) => this.decrypt(item))
      );

      // Reinicializar con nueva clave
      const oldKey = this.masterKey;
      await this.initialize(newUserId);

      // Encriptar con nueva clave
      const reEncrypted = await Promise.all(
        decrypted.map((item) => this.encrypt(item))
      );

      globalLogger.info('Rotación de claves completada', { itemCount: reEncrypted.length });

      return reEncrypted;
    } catch (error: any) {
      globalLogger.error('Error en rotación de claves', error);
      throw new Error('Error al rotar claves de encriptación');
    }
  }
}

/**
 * Helper para obtener la instancia singleton
 */
export const getEncryptionService = () => EncryptionService.getInstance();

/**
 * Hook para usar en componentes React (opcional)
 */
export function useEncryption() {
  const service = getEncryptionService();

  return {
    encrypt: (data: any) => service.encrypt(data),
    decrypt: <T = any>(encrypted: string) => service.decrypt<T>(encrypted),
    encryptPhoto: (base64: string) => service.encryptPhoto(base64),
    decryptPhoto: (encrypted: string) => service.decryptPhoto(encrypted),
    generateHash: (data: string) => service.generateHash(data),
    verifyIntegrity: (data: string, hash: string) => service.verifyIntegrity(data, hash),
    isInitialized: () => service.isInitialized(),
    clear: () => service.clear(),
  };
}
