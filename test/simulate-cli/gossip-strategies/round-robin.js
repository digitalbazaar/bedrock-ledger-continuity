/*
 * Copyright (c) 2020 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const _ = require('lodash');

module.exports.run = async function({}) {
  const localNodeId = parseInt(this.nodeId, 10);
  let downloadedEvents = 0;
  let totalDownloadedEvents = 0;
  const gossipSessions = [];

  // ensure gossip iteration is being tracked
  if(this.gossipCounter === undefined) {
    this.gossipCounter = Math.floor(Math.random() * this.nodes.size);
  } else {
    this.gossipCounter += 1;
  }
  // skip this node in witness selection
  if(((localNodeId + this.gossipCounter) % this.nodes.size) === localNodeId) {
    this.gossipCounter += 1;
  }

  // generate Map of witnesses
  const witnesses = new Map();
  console.log(typeof this.getWitnessPeers());
  const witnessPeers = await this.getWitnessPeers();
  witnessPeers.forEach(
    witness => witnesses.set(witness.nodeId, witness));

  // generate Map of witnesses that have notified this peer
  const notificationWitnesses = new Map();
  witnessPeers.forEach(witness => {
    const notified = (2 / this.nodes.size) < Math.random();
    if(notified) {
      notificationWitnesses.set(witness.nodeId, witness);
    }
  });

  // generate Map of non-witnesses that have notified this peer
  const notificationPeers = new Map();
  const peers = await this.getPeers();
  peers.forEach(peer => {
    const notified = (2 / this.nodes.size) < Math.random();
    if(notified && !witnesses.has(peer.nodeId)) {
      notificationPeers.set(peer.nodeId, peer);
    }
  });

  // merge round-robin witnesses
  const roundRobinWitness =
    ((localNodeId + this.gossipCounter) % this.nodes.size).toString();
  totalDownloadedEvents +=
    await _mergeNodeEvents(this, witnesses.get(roundRobinWitness));
  notificationWitnesses.delete(roundRobinWitness);
  gossipSessions.push(
    {peer: roundRobinWitness, events: totalDownloadedEvents});

  // attempt to merge random notification witness
  let randomMergeCount = 0;
  ({randomMergeCount, downloadedEvents} = await _mergeWithNode({node: this,
    peers: notificationWitnesses, randomMergeCount, gossipSessions}));
  totalDownloadedEvents += downloadedEvents;

  // attempt to merge random notification peer
  ({randomMergeCount, downloadedEvents} = await _mergeWithNode({node: this,
    peers: notificationPeers, randomMergeCount, gossipSessions}));
  totalDownloadedEvents += downloadedEvents;

  // if not at least 2 random merges, try random peers that have notified
  if(randomMergeCount < 2) {
    ({randomMergeCount, downloadedEvents} = await _mergeWithNode({node: this,
      peers: notificationPeers, randomMergeCount, gossipSessions}));
    totalDownloadedEvents += downloadedEvents;
  }

  // if not at least 2 random merges, try random witnesses that have notified
  if(randomMergeCount < 2) {
    ({randomMergeCount, downloadedEvents} = await _mergeWithNode({node: this,
      peers: notificationWitnesses, randomMergeCount, gossipSessions}));
    totalDownloadedEvents += downloadedEvents;
  }

  return gossipSessions;
};

async function _mergeWithNode({node, peers, randomMergeCount, gossipSessions}) {
  let updatedMergeCount = randomMergeCount;
  let downloadedEvents = 0;

  if(peers.size > 0) {
    const allPeerIds = Array.from(peers.keys());
    const randomPeerId = allPeerIds[
      Math.floor(Math.random() * allPeerIds.length)];
    downloadedEvents = await _mergeNodeEvents(node, peers.get(randomPeerId));
    gossipSessions.push({peer: randomPeerId, events: downloadedEvents});
    peers.delete(randomPeerId);
    updatedMergeCount = randomMergeCount + 1;
  }

  return {downloadedEvents, randomMergeCount: updatedMergeCount};
}

async function _mergeNodeEvents(node, peer) {
  console.log('_mergeNodeEvents', node.nodeId, '<-', peer.nodeId);
  // get different histories
  const nodeHistory = await node.getHistory();
  const peerHistory = await peer.getHistory();

  // get different events
  const nodeEvents = nodeHistory.events.map(({eventHash}) => eventHash);
  const peerEvents = peerHistory.events.map(({eventHash}) => eventHash);

  // diff histories
  const diff = _.difference(peerEvents, nodeEvents);

  // download events from peer
  const downloadedEvents = await peer.getEvents({events: diff});

  // add events to node
  await node.addEvents({events: downloadedEvents});

  const gossips = node.activityLog.filter(({type}) => type === 'gossip');
  const downloadedEventsTotal = gossips.reduce((acc, curr) => {
    Object.values(curr.details).forEach(event => {
      if(typeof event === 'object') {
        acc += event.events;
      }
    });
    return acc;
  }, 0);

  const totalEvents = downloadedEventsTotal + downloadedEvents.length;
  console.log(
    `  gossip from ${peer.nodeId}: ${downloadedEvents.length}/${totalEvents}`);

  return downloadedEvents.length;
}