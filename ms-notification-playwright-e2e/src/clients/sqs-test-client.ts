import {
  SQSClient,
  GetQueueUrlCommand,
  ReceiveMessageCommand,
  PurgeQueueCommand
} from '@aws-sdk/client-sqs';
import { EnvironmentConfig } from '../config/environment';

export class SqsTestClient {
  private client?: SQSClient;

  constructor(private readonly env: EnvironmentConfig) {}

  private sqs(): SQSClient {
    this.client ??= new SQSClient({
      region: this.env.awsRegion,
      endpoint: this.env.awsEndpoint,
      credentials: this.env.awsAccessKeyId && this.env.awsSecretAccessKey
        ? { accessKeyId: this.env.awsAccessKeyId, secretAccessKey: this.env.awsSecretAccessKey }
        : undefined
    });
    return this.client;
  }

  private async queueUrl(queueName: string): Promise<string> {
    const response = await this.sqs().send(new GetQueueUrlCommand({ QueueName: queueName }));
    if (!response.QueueUrl) throw new Error(`QueueUrl não encontrada para ${queueName}`);
    return response.QueueUrl;
  }

  async receive(queueName: string, maxMessages = 5): Promise<string[]> {
    const QueueUrl = await this.queueUrl(queueName);
    const response = await this.sqs().send(new ReceiveMessageCommand({
      QueueUrl,
      MaxNumberOfMessages: maxMessages,
      WaitTimeSeconds: 2
    }));
    return (response.Messages ?? []).map((m) => m.Body ?? '');
  }

  async purge(queueName: string): Promise<void> {
    try {
      const QueueUrl = await this.queueUrl(queueName);
      await this.sqs().send(new PurgeQueueCommand({ QueueUrl }));
    } catch (error) {
      // A fila pode ainda não existir em HML/PROD ou o usuário pode não ter permissão.
      if (this.env.name === 'local') throw error;
    }
  }

  async purgeKnownQueues(): Promise<void> {
    if (this.env.name !== 'local') return;
    await Promise.allSettled(Object.values(this.env.queues).map((queue) => this.purge(queue)));
  }
}
