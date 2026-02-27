import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

const StepStates = {
  Idle: 'idle',
  AwaitType: 'awaitType',
  ConfirmType: 'confirmType',
  NicknamePrompt: 'nicknamePrompt',
  AwaitNickname: 'awaitNickname',
  Setup: 'setup',
  Completed: 'completed',
};

const classifyNode = (id) => {
  const map = {
    validator: 'Class I — Core Validators & Committee',
    committee: 'Class I — Core Validators & Committee',
    archive_validator: 'Class II — Archive, Audit & Data Availability',
    audit_validator: 'Class II — Archive, Audit & Data Availability',
    data_availability: 'Class II — Archive, Audit & Data Availability',
    relayer: 'Class III — Relayers & Cross-Chain',
    witness: 'Class III — Relayers & Cross-Chain',
    oracle: 'Class III — Relayers & Cross-Chain',
    uma_coordinator: 'Class III — Relayers & Cross-Chain',
    cross_chain_verifier: 'Class III — Relayers & Cross-Chain',
    compute: 'Class IV — Compute & Specialized',
    ai_inference: 'Class IV — Compute & Specialized',
    pqc_crypto: 'Class IV — Compute & Specialized',
    governance_auditor: 'Class V — Governance & RPC',
    treasury_controller: 'Class V — Governance & RPC',
    security_council: 'Class V — Governance & RPC',
    rpc_gateway: 'Class V — Governance & RPC',
    indexer: 'Class V — Governance & RPC',
    observer: 'Class V — Governance & RPC',
  };
  return map[id] || 'Other';
};

function JarvisAgentSetup({ onComplete }) {
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [availableTypes, setAvailableTypes] = useState([]);
  const [selectedType, setSelectedType] = useState(null);
  const [currentStep, setCurrentStep] = useState(StepStates.Idle);
  const [progress, setProgress] = useState(0);
  const [setupInProgress, setSetupInProgress] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [networkError, setNetworkError] = useState(null);
  const [conversationStarted, setConversationStarted] = useState(false);
  const [nodeNickname, setNodeNickname] = useState('');
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const agentQueueRef = useRef(Promise.resolve());

  const addMessage = useCallback((text, sender = 'agent', type = 'text', payload = null) => {
    setMessages((prev) => [...prev, { text, sender, type, payload }]);
  }, []);

  const agentSay = useCallback((text, delay = 1000) => {
    setIsTyping(true);
    clearTimeout(typingTimeoutRef.current);
    const typingDelay = Math.min(delay + text.length * 7, 3200);
    return new Promise((resolve) => {
      typingTimeoutRef.current = window.setTimeout(() => {
        addMessage(text, 'agent', 'text');
        setIsTyping(false);
        resolve();
      }, typingDelay);
    });
  }, [addMessage]);

  const queueAgentMessage = useCallback((text, delay = 1000) => {
    agentQueueRef.current = agentQueueRef.current.then(() => agentSay(text, delay));
    return agentQueueRef.current;
  }, [agentSay]);

  useEffect(() => () => clearTimeout(typingTimeoutRef.current), []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const groupedTypes = useMemo(() => {
    const groups = {};
    availableTypes
      .filter((type) => type.compatible)
      .forEach((type) => {
        const group = classifyNode(type.id);
        if (!groups[group]) {
          groups[group] = [];
        }
        groups[group].push(type);
      });
    return groups;
  }, [availableTypes]);

  const insertNodeOptions = useCallback(() => {
    if (!Object.keys(groupedTypes).length) {
      return;
    }
    addMessage('Select the node type you would like to set up:', 'agent', 'node-options', {
      groups: groupedTypes,
    });
    setCurrentStep(StepStates.AwaitType);
  }, [addMessage, groupedTypes]);

  const startConversation = useCallback(async () => {
    if (conversationStarted || availableTypes.length === 0) {
      return;
    }
    setConversationStarted(true);
    agentQueueRef.current = Promise.resolve();
    await queueAgentMessage("👋 Hello! I'm Jarvis, your Synergy Network Assistant.", 400);
    await queueAgentMessage(
      "I'm here to help you get set up to operate a Synergy node on your own machine. We'll configure an isolated, user-operated local node environment.",
      500,
    );
    await queueAgentMessage(
      'Before we begin, let me explain something important: your nodes run inside an isolated workspace so your machine stays safe.',
      500,
    );
    await queueAgentMessage(
      'Setup mode is user-operated local by default, so external network registration and sync are skipped unless you explicitly switch modes later.',
      500,
    );
    await queueAgentMessage(
      "Now, let's get started! Which type of node would you like to set up?",
      500,
    );
    insertNodeOptions();
  }, [availableTypes.length, conversationStarted, insertNodeOptions, queueAgentMessage]);

  useEffect(() => {
    startConversation();
  }, [availableTypes.length, startConversation]);

  useEffect(() => {
    const loadTypes = async () => {
      try {
        const types = await invoke('get_available_node_types');
        if (Array.isArray(types)) {
          setAvailableTypes(types);
        } else {
          setAvailableTypes([]);
        }
      } catch (err) {
        console.error('Failed to load node types:', err);
        queueAgentMessage('Failed to load node types. Please restart the control panel.', 1000);
      }
    };
    loadTypes();
  }, [queueAgentMessage]);

  useEffect(() => {
    const checkNetwork = async () => {
      try {
        await invoke('init_network_discovery');
        const status = await invoke('get_network_peers');
        if (status.bootstrap_nodes_reachable === 0) {
          await queueAgentMessage(
            'Network check note: bootstrap nodes are currently unreachable, but local user-operated setup can still proceed.',
            1000,
          );
        } else {
          await queueAgentMessage(
            `Optional network check: ${status.bootstrap_nodes_reachable}/${status.bootstrap_nodes_total} bootstrap endpoints reachable.`,
            1000,
          );
        }
      } catch (err) {
        console.warn('Network check failed:', err);
        await queueAgentMessage(
          'Optional network check could not be completed. Local user-operated setup can still continue.',
          1000,
        );
      }
    };
    checkNetwork();
  }, [queueAgentMessage]);

  useEffect(() => {
    let unlisten = null;
    listen('setup-progress', (event) => {
      const payload = event?.payload || {};
      if (typeof payload.progress !== 'number') {
        return;
      }
      setProgress(payload.progress);
      setSetupInProgress(true);

      const eventMessage = payload.message || payload.step || 'Progress update';
      const isError = payload.step?.includes('-failed') ||
        eventMessage.toLowerCase().includes('error') ||
        eventMessage.toLowerCase().includes('failed');

      if (isError) {
        setNetworkError(eventMessage);
        addMessage(`[ERROR] ${eventMessage}`, 'agent');
      } else {
        addMessage(`[${payload.progress}%] ${eventMessage}`, 'agent');
      }
    }).then((fn) => {
      unlisten = fn;
    });

    let unlistenTerminal = null;
    listen('terminal-output', (event) => {
      const payload = event?.payload || {};
      const line = payload.line || '';
      const type = payload.type || 'info';

      if (line && !line.includes('[%]')) {
        if (type === 'error') {
          setNetworkError(line);
        }
        addMessage(line, 'agent');
      }
    }).then((fn) => {
      unlistenTerminal = fn;
    });

    return () => {
      if (unlisten) unlisten();
      if (unlistenTerminal) unlistenTerminal();
    };
  }, [addMessage]);

  const handleRestartSetup = useCallback(() => {
    setMessages([]);
    setSelectedType(null);
    setNodeNickname('');
    setCurrentStep(StepStates.Idle);
    setConversationStarted(false);
    setProgress(0);
    setSetupInProgress(false);
    setNetworkError(null);
    setUserInput('');
    agentQueueRef.current = Promise.resolve();
  }, []);

  const resolveType = useCallback((input) => {
    const normalized = input.toLowerCase();
    return availableTypes.find(
      (type) =>
        type.compatible &&
        (type.id.toLowerCase() === normalized || type.display_name.toLowerCase() === normalized),
    );
  }, [availableTypes]);

  const handleTypeSelection = useCallback(async (type, includeUserMessage = true) => {
    if (!type || !type.compatible || setupInProgress) {
      return;
    }
    if (includeUserMessage) {
      addMessage(`I want to set up the ${type.display_name} node.`, 'user');
    }
    setSelectedType(type);
    setNodeNickname('');
    setCurrentStep(StepStates.ConfirmType);
    await queueAgentMessage(
      `The ${type.display_name} role ${type.description}. Are you sure you want to continue with this type? Please reply "yes" or "no".`,
      900,
    );
  }, [addMessage, queueAgentMessage, setupInProgress]);

  const startNodeSetup = useCallback(async (nicknameOverride) => {
    if (!selectedType) {
      queueAgentMessage('No node type selected. Please choose a node type to continue.', 800);
      return;
    }
    const displayName = nicknameOverride || nodeNickname || selectedType.display_name;
    setSetupInProgress(true);
    setProgress(0);
    setCurrentStep(StepStates.Setup);
    await queueAgentMessage('Starting deterministic setup...', 900);
    try {
      const recipePath = `recipes/${selectedType.id}.yml`;
      const nodeId = await invoke('agent_setup_node', {
        recipePath,
        displayName,
        setupOptions: {
          userOperated: true,
          autoStart: true,
        },
      });
      await queueAgentMessage(`Setup complete! Your node ID is ${nodeId}.`, 1000);
      await queueAgentMessage('Thank you for your patience; I am getting you on over to the node dashboard now.');
      setSetupInProgress(false);
      setCurrentStep(StepStates.Completed);
      if (onComplete) {
        onComplete(nodeId);
      }
    } catch (err) {
      console.error('agent_setup_node failed', err);
      await queueAgentMessage(`Setup failed: ${err}. Let's start over.`, 1000);
      setSetupInProgress(false);
      setSelectedType(null);
      setNodeNickname('');
      setCurrentStep(StepStates.AwaitType);
      insertNodeOptions();
    }
  }, [nodeNickname, onComplete, queueAgentMessage, selectedType, insertNodeOptions]);

  const handleSubmit = useCallback(async (event) => {
    event.preventDefault();
    const input = userInput.trim();
    if (!input) {
      return;
    }
    addMessage(input, 'user');
    setUserInput('');

    if (setupInProgress) {
      queueAgentMessage('Setup is already in progress. Please wait until it finishes.', 800);
      return;
    }

    const normalized = input.toLowerCase();

    if (currentStep === StepStates.AwaitType) {
      const chosen = resolveType(input);
      if (!chosen) {
        queueAgentMessage('Please select a node type from the cards above.', 800);
        return;
      }
      await handleTypeSelection(chosen, false);
      return;
    }

    if (currentStep === StepStates.ConfirmType) {
      if (!selectedType) {
        queueAgentMessage('You need to pick a node type before confirming.', 800);
        return;
      }
      if (normalized.startsWith('y')) {
        setCurrentStep(StepStates.NicknamePrompt);
        queueAgentMessage('Would you like to give your node a nickname? Reply with "yes" or "no".', 800);
      } else {
        setSelectedType(null);
        queueAgentMessage('No problem — let me show the available node types again.', 800);
        insertNodeOptions();
      }
      return;
    }

    if (currentStep === StepStates.NicknamePrompt) {
      if (normalized.startsWith('y')) {
        setCurrentStep(StepStates.AwaitNickname);
        queueAgentMessage('What would you like to name your node?', 800);
      } else {
        startNodeSetup();
      }
      return;
    }

    if (currentStep === StepStates.AwaitNickname) {
      setNodeNickname(input);
      startNodeSetup(input);
      return;
    }

    queueAgentMessage('Please select a node type from the list above to continue.', 800);
  }, [addMessage, currentStep, handleTypeSelection, insertNodeOptions, nodeNickname, queueAgentMessage, resolveType, setupInProgress, selectedType, startNodeSetup, userInput]);

  return (
    <div
      className="jarvis-agent"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        padding: '20px',
        gap: '12px',
        color: 'var(--snrg-text-primary)',
        background: 'var(--snrg-bg-gradient-mesh)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <img
          src="/snrg.gif"
          alt="Synergy"
          style={{ width: '32px', height: '32px', borderRadius: '50%' }}
        />
        <div style={{ fontWeight: 600, color: 'var(--snrg-text-secondary)' }}>
          Jarvis — Synergy Setup Assistant
        </div>
      </div>

      <div
        className="messages"
        style={{
          flex: 1,
          overflowY: 'auto',
          background: 'var(--snrg-bg-glass)',
          border: '1px solid var(--snrg-border-neutral)',
          borderRadius: '12px',
          padding: '16px',
          backdropFilter: 'blur(6px)',
          boxShadow: 'var(--snrg-glow-quad)',
        }}
      >
        {messages.map((msg, idx) => (
          <div
            key={`${msg.sender}-${idx}-${msg.type || 'text'}`}
            className={`message ${msg.sender}`}
          >
            <div
              className={`message-content ${msg.type === 'node-options' ? 'node-options-content' : ''}`}
            >
              {msg.type === 'node-options' ? (
                <div>
                  <p style={{ margin: '0 0 0.75rem 0' }}>{msg.text}</p>
                  <div className="node-options-grid">
                    {Object.entries(msg.payload?.groups || {}).map(([groupName, types]) => (
                      <div key={groupName} className="node-options-group">
                        <div className="node-options-group-title">{groupName}</div>
                        <div className="node-options-card-grid">
                          {types.map((type) => (
                            <button
                              key={type.id}
                              type="button"
                              className={`node-option-card ${selectedType?.id === type.id ? 'selected' : ''}`}
                              onClick={() => handleTypeSelection(type)}
                              disabled={!type.compatible || setupInProgress}
                            >
                              <div className="node-option-title">{type.display_name}</div>
                              <div className="node-option-id">{type.id}</div>
                              <div className="node-option-desc">{type.description}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p style={{ margin: 0 }}>{msg.text}</p>
              )}
            </div>
          </div>
        ))}
        {isTyping && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px' }}>
            <img
              src="/snrg.gif"
              alt="typing"
              style={{ width: '22px', height: '22px', borderRadius: '50%' }}
            />
            <div className="typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}
        {networkError && !setupInProgress && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              padding: '16px',
              marginTop: '12px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '8px',
            }}
          >
            <span style={{ color: 'var(--snrg-error)', fontSize: '0.9rem' }}>
              Setup encountered an issue: {networkError}
            </span>
            <button
              onClick={handleRestartSetup}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                background: 'var(--snrg-primary-gradient-horizontal)',
                color: 'var(--snrg-text-primary)',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.85rem',
              }}
            >
              Restart Setup
            </button>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div
        className="progress-container"
        style={{ marginTop: '0.25rem' }}
      >
        <div
          style={{
            background: 'var(--snrg-bg-elevated)',
            borderRadius: '6px',
            height: '10px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: '10px',
              background: 'var(--snrg-primary-gradient-horizontal)',
              transition: 'width 0.3s ease',
            }}
          ></div>
        </div>
        <div style={{ marginTop: '0.25rem', fontSize: '0.9rem' }}>{progress}%</div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="input-form"
        style={{
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
        }}
      >
        <input
          type="text"
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          placeholder="Type your response..."
          disabled={setupInProgress}
          style={{
            flex: 1,
            padding: '10px 12px',
            borderRadius: '10px',
            border: '1px solid var(--snrg-border-neutral)',
            background: 'var(--snrg-bg-glass-light)',
            color: 'var(--snrg-text-primary)',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={setupInProgress}
          style={{
            padding: '10px 16px',
            borderRadius: '10px',
            border: 'none',
            background: setupInProgress
              ? 'var(--snrg-border-neutral-strong)'
              : 'var(--snrg-primary-gradient-horizontal)',
            color: 'var(--snrg-text-primary)',
            cursor: setupInProgress ? 'not-allowed' : 'pointer',
            fontWeight: 600,
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
}

export default JarvisAgentSetup;
