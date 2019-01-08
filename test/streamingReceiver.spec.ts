// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

import "mocha";
import * as chai from "chai";
const should = chai.should();
import * as chaiAsPromised from "chai-as-promised";
import * as dotenv from "dotenv";
dotenv.config();
chai.use(chaiAsPromised);
import {
  Namespace,
  QueueClient,
  SendableMessageInfo,
  generateUuid,
  ServiceBusMessage,
  TopicClient,
  SubscriptionClient,
  delay
} from "../lib";

const testMessages: SendableMessageInfo[] = [
  {
    body: "hello1",
    messageId: `test message ${generateUuid()}`
  },
  {
    body: "hello2",
    messageId: `test message ${generateUuid()}`
  }
];

function testReceivedMessages(receivedMsgs: ServiceBusMessage[]): void {
  should.equal(receivedMsgs.length, 2);
  should.equal(receivedMsgs[0].body, testMessages[0].body);
  should.equal(receivedMsgs[0].messageId, testMessages[0].messageId);
  should.equal(receivedMsgs[1].body, testMessages[1].body);
  should.equal(receivedMsgs[1].messageId, testMessages[1].messageId);
}

async function testPeekMsgsLength(
  client: QueueClient | SubscriptionClient,
  expectedPeekLength: number
): Promise<void> {
  const peekedMsgs = await client.peek(expectedPeekLength + 1);
  should.equal(peekedMsgs.length, expectedPeekLength);
}

describe("Streaming Receiver from Queue/Subscription", function(): void {
  let namespace: Namespace;
  let queueClient: QueueClient;
  let topicClient: TopicClient;
  let subscriptionClient: SubscriptionClient;

  beforeEach(async () => {
    // The tests in this file expect the env variables to contain the connection string and
    // the names of empty queue/topic/subscription that are to be tested

    if (!process.env.SERVICEBUS_CONNECTION_STRING) {
      throw new Error(
        "Define SERVICEBUS_CONNECTION_STRING in your environment before running integration tests."
      );
    }
    if (!process.env.TOPIC_NAME) {
      throw new Error("Define TOPIC_NAME in your environment before running integration tests.");
    }
    if (!process.env.QUEUE_NAME) {
      throw new Error("Define QUEUE_NAME in your environment before running integration tests.");
    }
    if (!process.env.SUBSCRIPTION_NAME) {
      throw new Error(
        "Define SUBSCRIPTION_NAME in your environment before running integration tests."
      );
    }

    namespace = Namespace.createFromConnectionString(process.env.SERVICEBUS_CONNECTION_STRING);
    queueClient = namespace.createQueueClient(process.env.QUEUE_NAME);
    topicClient = namespace.createTopicClient(process.env.TOPIC_NAME);
    subscriptionClient = namespace.createSubscriptionClient(
      process.env.TOPIC_NAME,
      process.env.SUBSCRIPTION_NAME
    );

    const peekedQueueMsg = await queueClient.peek();
    if (peekedQueueMsg.length) {
      throw new Error("Please use an empty queue for integration testing");
    }

    const peekedSubscriptionMsg = await subscriptionClient.peek();
    if (peekedSubscriptionMsg.length) {
      throw new Error("Please use an empty Subscription for integration testing");
    }
  });

  afterEach(async () => {
    return namespace.close();
  });

  it("AutoComplete removes the message from Queue", async function(): Promise<void> {
    await queueClient.sendBatch(testMessages);

    const receivedMsgs: ServiceBusMessage[] = [];
    const receiveListener = queueClient.receive(
      (msg: ServiceBusMessage) => {
        receivedMsgs.push(msg);
        return Promise.resolve();
      },
      (err: Error) => {
        should.not.exist(err);
      }
    );

    await delay(1000);

    testReceivedMessages(receivedMsgs);

    await receiveListener.stop();
    await testPeekMsgsLength(queueClient, 0);
  });

  it("AutoComplete removes the message from Subscription", async function(): Promise<void> {
    await topicClient.sendBatch(testMessages);

    const receivedMsgs: ServiceBusMessage[] = [];
    const receiveListener = subscriptionClient.receive(
      (msg: ServiceBusMessage) => {
        receivedMsgs.push(msg);
        return Promise.resolve();
      },
      (err: Error) => {
        should.not.exist(err);
      }
    );

    await delay(1000);

    testReceivedMessages(receivedMsgs);

    await receiveListener.stop();
    await testPeekMsgsLength(subscriptionClient, 0);
  });

  it("Disabled autoComplete, no manual complete retains the message in Queue", async function(): Promise<
    void
  > {
    await queueClient.sendBatch(testMessages);

    const receivedMsgs: ServiceBusMessage[] = [];
    const receiveListener = queueClient.receive(
      (msg: ServiceBusMessage) => {
        receivedMsgs.push(msg);
        return Promise.resolve();
      },
      (err: Error) => {
        should.not.exist(err);
      },
      { autoComplete: false }
    );

    await delay(1000);

    testReceivedMessages(receivedMsgs);

    await testPeekMsgsLength(queueClient, 2);

    await receivedMsgs[0].complete();
    await receivedMsgs[1].complete();
    await receiveListener.stop();
  });

  it("Disabled autoComplete, no manual complete retains the message in Subscription", async function(): Promise<
    void
  > {
    await topicClient.sendBatch(testMessages);

    const receivedMsgs: ServiceBusMessage[] = [];
    const receiveListener = subscriptionClient.receive(
      (msg: ServiceBusMessage) => {
        receivedMsgs.push(msg);
        return Promise.resolve();
      },
      (err: Error) => {
        should.not.exist(err);
      },
      { autoComplete: false }
    );

    await delay(1000);

    testReceivedMessages(receivedMsgs);

    await testPeekMsgsLength(subscriptionClient, 2);

    await receivedMsgs[0].complete();
    await receivedMsgs[1].complete();
    await receiveListener.stop();
  });

  it("Disabled autoComplete, manual complete removes the message from Queue", async function(): Promise<
    void
  > {
    await queueClient.sendBatch(testMessages);

    const receivedMsgs: ServiceBusMessage[] = [];
    const receiveListener = queueClient.receive(
      (msg: ServiceBusMessage) => {
        receivedMsgs.push(msg);
        return msg.complete();
      },
      (err: Error) => {
        should.not.exist(err);
      },
      { autoComplete: false }
    );

    await delay(1000);

    testReceivedMessages(receivedMsgs);

    await testPeekMsgsLength(queueClient, 0);

    await receiveListener.stop();
  });

  it("Disabled autoComplete, manual complete removes the message from Subscription", async function(): Promise<
    void
  > {
    await topicClient.sendBatch(testMessages);

    const receivedMsgs: ServiceBusMessage[] = [];
    const receiveListener = subscriptionClient.receive(
      (msg: ServiceBusMessage) => {
        receivedMsgs.push(msg);
        return msg.complete();
      },
      (err: Error) => {
        should.not.exist(err);
      },
      { autoComplete: false }
    );

    await delay(1000);

    testReceivedMessages(receivedMsgs);

    await testPeekMsgsLength(subscriptionClient, 0);

    await receiveListener.stop();
  });

  it.only("Abandoned message is retained in the Queue with incremented deliveryCount", async function(): Promise<
    void
  > {
    await queueClient.sendBatch(testMessages);

    const receivedMsgs: ServiceBusMessage[] = [];
    const receiveListener = await queueClient.receive(
      (msg: ServiceBusMessage) => {
        receivedMsgs.push(msg);
        return Promise.resolve();
      },
      (err: Error) => {
        should.not.exist(err);
      },
      { autoComplete: false }
    );

    await delay(1000);

    console.log(receiveListener);
    console.log("hello here I'm 1");
    testReceivedMessages(receivedMsgs);
    console.log("hello here I'm 2");
    await testPeekMsgsLength(queueClient, 2);
    console.log(receivedMsgs[0].messageId, testMessages[0].messageId);
    console.log("hello here I'm 3");
    console.log(receivedMsgs[1].messageId, testMessages[1].messageId);

    await receivedMsgs[0].abandon();
    await receivedMsgs[1].abandon();

    await receiveListener.stop();

    await delay(5000);
    const receivedMsgs2: ServiceBusMessage[] = [];
    const receiveListener2 = await queueClient.receive(
      (msg: ServiceBusMessage) => {
        receivedMsgs2.push(msg);
        return Promise.resolve();
      },
      (err: Error) => {
        should.not.exist(err);
      },
      { autoComplete: false }
    );
    console.log("hello here I'm 4");
    console.log(receiveListener2);

    await testReceivedMessages(receivedMsgs2);
    console.log("hello here I'm 5");

    await testPeekMsgsLength(queueClient, 2);
    console.log("hello here I'm 6");

    should.equal(receivedMsgs2[0].deliveryCount, 1);
    should.equal(receivedMsgs2[1].deliveryCount, 1);
    await receivedMsgs2[0].complete();
    await receivedMsgs2[1].complete();
    await receiveListener2.stop();
  });

  it("Abandoned message is retained in the Subscription with incremented deliveryCount", async function(): Promise<
    void
  > {
    await topicClient.send(testMessages[0]);

    let receivedMsgs = await subscriptionClient.receiveBatch(1);

    should.equal(receivedMsgs.length, 1);
    should.equal(receivedMsgs[0].deliveryCount, 0);
    should.equal(receivedMsgs[0].messageId, testMessages[0].messageId);

    // TODO: This is taking 20 seconds. Why?
    await receivedMsgs[0].abandon();

    await testPeekMsgsLength(subscriptionClient, 1);

    receivedMsgs = await subscriptionClient.receiveBatch(1);

    should.equal(receivedMsgs.length, 1);
    should.equal(receivedMsgs[0].deliveryCount, 1);
    should.equal(receivedMsgs[0].messageId, testMessages[0].messageId);

    await receivedMsgs[0].complete();
  });
});
