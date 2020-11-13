/*
 * Copyright (c) 2020 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const mongoClient = require('./mongo-client');
const promClient = require('./prometheus-client');
const Simulator = require('../tools/Simulator');

const PIPELINE_FILE = './pipeline-reference.js';
const WITNESS_COUNT = 4;

const USER = 'add-user';
const SEND_RUN = false;

async function load() {
  const creator = USER;
  const pipelineApi = require(PIPELINE_FILE);
  const {pipeline, name} = pipelineApi;

  const simulator = new Simulator({
    name, creator, witnessCount: WITNESS_COUNT, pipeline
  });

  const report = await simulator.start();
  const {graph} = simulator;

  const ledgerNodeId = '1';

  const input = {
    ledgerNodeId,
    history: graph.getHistory({nodeId: ledgerNodeId}),
    electors: graph.getElectors(),
    recoveryElectors: [],
    mode: 'first'
  };

  const display = {
    title: name,
    nodeOrder: ['0', '1', '2', '3']
  };

  const visualizer = {};
  for(const elector of graph.getElectors()) {
    const ledgerNodeId = elector.id;
    visualizer[ledgerNodeId] = {
      ledgerNodeId,
      history: graph.getHistory({nodeId: ledgerNodeId}),
      electors: graph.getElectors(),
      recoveryElectors: [],
      mode: 'first'
    };
  }

  if(SEND_RUN) {
    await Promise.all([
      promClient.send({report}),
      mongoClient.send({payload: {report, visualizer}}),
    ]);
  }

  console.log(report);
  return {input, display, report};
}

// load();

module.exports = {load};
