declare module 'qz-tray' {
  interface QzConnectionOptions {
    retries?: number;
    delay?: number;
  }

  interface QzPrintOptions {
    jobName?: string;
    encoding?: string;
    forceRaw?: boolean;
  }

  interface QzPrintConfig {
    readonly printer: unknown;
  }

  interface QzRawImageData {
    type: 'raw';
    format: 'image';
    flavor: 'base64';
    data: string;
    options: {
      language: 'ESCPOS';
    };
  }

  type QzPrintData = string | QzRawImageData;

  type QzSignatureResolver = (
    resolve: (signature: string) => void,
    reject: (reason?: unknown) => void,
  ) => void;

  interface QzTrayApi {
    security: {
      setCertificatePromise(
        promise: Promise<string>,
        options?: { rejectOnFailure?: boolean },
      ): void;
      setSignatureAlgorithm(algorithm: 'SHA1' | 'SHA256' | 'SHA512'): void;
      setSignaturePromise(factory: (request: string) => QzSignatureResolver): void;
    };
    websocket: {
      isActive(): boolean;
      connect(options?: QzConnectionOptions): Promise<void>;
    };
    printers: {
      getDefault(): Promise<string>;
      find(query?: string): Promise<string | string[]>;
    };
    configs: {
      create(printer: string, options?: QzPrintOptions): QzPrintConfig;
    };
    print(config: QzPrintConfig, data: QzPrintData[]): Promise<void>;
  }

  const qz: QzTrayApi;
  export default qz;
}
