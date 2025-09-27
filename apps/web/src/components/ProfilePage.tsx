import { useState, useEffect } from 'react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { useAuth } from '../lib/auth';

// AI Provider and Model configurations
const AI_PROVIDERS = {
    gemini: {
        name: 'Google Gemini',
        models: [
            { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
            { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
            { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
            { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite' },
        ],
    },
    openrouter: {
        name: 'OpenRouter',
        models: [
            { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
            { id: 'gpt-4o', name: 'GPT-4o' },
            { id: 'claude-3-haiku', name: 'Claude 3 Haiku' },
            { id: 'llama-3.1-70b', name: 'Llama 3.1 70B' },
            { id: 'gpt-oss-120b', name: 'GPT OSS 120B' },
        ],
    },
    openai: {
        name: 'OpenAI',
        models: [
            { id: 'gpt-4o', name: 'GPT-4o' },
            { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
            { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
            { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
        ],
    },
    anthropic: {
        name: 'Anthropic',
        models: [
            { id: 'claude-3-sonnet', name: 'Claude 3 Sonnet' },
            { id: 'claude-3-haiku', name: 'Claude 3 Haiku' },
            { id: 'claude-3-opus', name: 'Claude 3 Opus' },
        ],
    },
} as const;

type AiProvider = keyof typeof AI_PROVIDERS;

interface AiConfiguration {
    id?: number;
    provider: AiProvider;
    modelName: string;
    apiKey: string;
    hasApiKey?: boolean;
    isActive: boolean;
}

export function ProfilePage() {
    const { user, logout, isAuthenticated } = useAuth();

    // Debug function to test authentication
    const testAuth = async () => {
        const token = localStorage.getItem('auth_token');
        console.log('Token exists:', !!token);
        console.log(
            'Token value:',
            token ? token.substring(0, 50) + '...' : 'null'
        );
        console.log('User object:', user);
        console.log('Is authenticated:', isAuthenticated);

        if (token) {
            try {
                const response = await fetch(
                    'http://localhost:3501/api/ai-config',
                    {
                        headers: { Authorization: `Bearer ${token}` },
                    }
                );
                console.log('Auth test response status:', response.status);
                const text = await response.text();
                console.log('Auth test response:', text);
            } catch (error) {
                console.error('Auth test failed:', error);
            }
        }
    };
    const [isEditing, setIsEditing] = useState(false);
    const [editedUsername, setEditedUsername] = useState(user?.username || '');
    const [editedEmail, setEditedEmail] = useState(user?.email || '');

    // AI Configuration state
    const [configurations, setConfigurations] = useState<AiConfiguration[]>([]);
    const [selectedProvider, setSelectedProvider] =
        useState<AiProvider>('gemini');
    const [selectedModel, setSelectedModel] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [showApiKey, setShowApiKey] = useState(false);
    const [configStatus, setConfigStatus] = useState<
        'saved' | 'saving' | 'error' | null
    >(null);
    const [editingConfigId, setEditingConfigId] = useState<number | null>(null);

    // Load AI configurations from API
    useEffect(() => {
        if (isAuthenticated) {
            fetchConfigurations();
        }
    }, [isAuthenticated]);

    // Load saved configuration API key into form when configurations are fetched
    useEffect(() => {
        // First try to find active config, then fall back to first available config
        const configToLoad =
            configurations.find(config => config.isActive) || configurations[0];
        if (configToLoad && !editingConfigId) {
            loadSavedConfigForEditing(configToLoad);
        }
    }, [configurations, editingConfigId]);

    // Set default model when provider changes (only if no configurations are loaded)
    useEffect(() => {
        const models = AI_PROVIDERS[selectedProvider].models;
        if (
            models.length > 0 &&
            !selectedModel &&
            configurations.length === 0
        ) {
            setSelectedModel(models[0].id);
        }
    }, [selectedProvider, selectedModel, configurations]);

    if (!isAuthenticated || !user) {
        return (
            <div className='min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center'>
                <div className='text-center'>
                    <h1 className='text-3xl font-bold text-white mb-4'>
                        Access Denied
                    </h1>
                    <p className='text-gray-300 mb-6'>
                        Please log in to view your profile.
                    </p>
                    <Button
                        onClick={() => (window.location.href = '/login')}
                        className='bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
                    >
                        Go to Login
                    </Button>
                </div>
            </div>
        );
    }

    const fetchConfigurations = async () => {
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(
                'http://localhost:3501/api/ai-config',
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            if (response.ok) {
                const data = await response.json();
                setConfigurations(data.configurations || []);
            }
        } catch (_error) {
            // Error fetching configurations - continue with empty state
        }
    };

    const handleSave = () => {
        // TODO: Implement profile update API call
        setIsEditing(false);
    };

    const handleApiConfigSave = async () => {
        if (!selectedProvider || !selectedModel || !apiKey.trim()) {
            return;
        }

        try {
            setConfigStatus('saving');
            const token = localStorage.getItem('auth_token');

            // Debug: Check if token exists
            if (!token) {
                console.error('No auth token found in localStorage');
                setConfigStatus('error');
                alert('Authentication token not found. Please log in again.');
                return;
            }

            console.log(
                'Sending request with token:',
                token.substring(0, 20) + '...'
            );

            const response = await fetch(
                'http://localhost:3501/api/ai-config',
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        provider: selectedProvider,
                        modelName: selectedModel,
                        apiKey: apiKey,
                        isActive: true, // Always set as active when saving
                    }),
                }
            );

            if (response.ok) {
                setConfigStatus('saved');
                setEditingConfigId(null);
                await fetchConfigurations();
                setTimeout(() => setConfigStatus(null), 3000);
            } else {
                const errorText = await response.text();
                console.error(
                    'API Error Response:',
                    response.status,
                    errorText
                );

                if (response.status === 401) {
                    alert('Authentication failed. Please log in again.');
                    // Clear invalid token
                    localStorage.removeItem('auth_token');
                    localStorage.removeItem('auth_user');
                    window.location.href = '/login';
                    return;
                }

                setConfigStatus('error');
                setTimeout(() => setConfigStatus(null), 3000);
            }
        } catch (error) {
            console.error('Request failed:', error);
            setConfigStatus('error');
            setTimeout(() => setConfigStatus(null), 3000);
        }
    };

    const loadSavedConfigForEditing = async (config: AiConfiguration) => {
        if (!config.id) return;

        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(
                `http://localhost:3501/api/ai-config/${config.id}/full`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            if (response.ok) {
                const fullConfig = await response.json();
                setSelectedProvider(fullConfig.provider);
                setSelectedModel(fullConfig.modelName);
                setApiKey(fullConfig.apiKey);
            }
        } catch (_error) {
            // Error loading config - keep the form empty
        }
    };

    const handleConfigCancel = () => {
        setSelectedProvider('gemini');
        setSelectedModel('');
        setApiKey('');
        setEditingConfigId(null);
    };

    const handleCancel = () => {
        setEditedUsername(user.username);
        setEditedEmail(user.email);
        setIsEditing(false);
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    };

    return (
        <div className='min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900'>
            <div className='container mx-auto px-4 py-8'>
                <div className='max-w-2xl mx-auto'>
                    {/* Header */}
                    <div className='text-center mb-8'>
                        <h1 className='text-4xl font-bold text-white mb-2'>
                            Profile
                        </h1>
                        <p className='text-gray-300'>
                            Manage your account settings
                        </p>
                    </div>

                    {/* Profile Card */}
                    <div className='bg-gradient-to-br from-gray-800/90 via-purple-800/80 to-gray-800/90 backdrop-blur-md rounded-xl border border-purple-500/20 shadow-2xl shadow-purple-900/50 p-8'>
                        {/* Avatar Section */}
                        <div className='text-center mb-8'>
                            <div className='w-24 h-24 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white text-3xl font-bold mx-auto mb-4'>
                                {user.username.charAt(0).toUpperCase()}
                            </div>
                            <div className='flex items-center justify-center gap-2 text-gray-300'>
                                <span className='text-sm'>Member Since</span>
                                <span className='text-white'>
                                    {formatDate(user.createdAt)}
                                </span>
                            </div>
                        </div>

                        {/* Profile Information */}
                        <div className='space-y-6'>
                            <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                                {/* Username Field */}
                                <div>
                                    <label className='block text-sm font-medium text-white mb-2'>
                                        Username
                                    </label>
                                    {isEditing ? (
                                        <Input
                                            value={editedUsername}
                                            onChange={e =>
                                                setEditedUsername(
                                                    e.target.value
                                                )
                                            }
                                            placeholder='Enter username'
                                        />
                                    ) : (
                                        <Input
                                            value={user.username}
                                            disabled
                                            className='bg-gray-800/90 border-gray-600 text-white'
                                        />
                                    )}
                                </div>

                                {/* Email Field */}
                                <div>
                                    <label className='block text-sm font-medium text-white mb-2'>
                                        Email
                                    </label>
                                    {isEditing ? (
                                        <Input
                                            type='email'
                                            value={editedEmail}
                                            onChange={e =>
                                                setEditedEmail(e.target.value)
                                            }
                                            placeholder='Enter email'
                                        />
                                    ) : (
                                        <Input
                                            type='email'
                                            value={user.email}
                                            disabled
                                            className='bg-gray-800/90 border-gray-600 text-white'
                                        />
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Debug Section */}
                        <div className='border-t border-purple-500/30 pt-6 mt-6'>
                            <details className='mb-4'>
                                <summary className='text-gray-400 cursor-pointer hover:text-white'>
                                    Debug Authentication
                                </summary>
                                <div className='mt-2'>
                                    <Button
                                        onClick={testAuth}
                                        className='bg-yellow-600 hover:bg-yellow-700 text-white text-sm'
                                    >
                                        Test Auth (Check Console)
                                    </Button>
                                </div>
                            </details>
                        </div>

                        {/* AI Configuration Section */}
                        <div className='border-t border-purple-500/30 pt-6 mt-6'>
                            <h3 className='text-lg font-semibold text-white mb-4'>
                                AI Configuration
                            </h3>

                            {/* Add/Edit Configuration */}
                            <div className='mb-6 p-4 bg-gradient-to-r from-gray-700/50 to-purple-700/30 rounded-lg border border-purple-400/20'>
                                <h4 className='text-md font-medium text-white mb-3'>
                                    {editingConfigId
                                        ? 'Edit Configuration'
                                        : 'Add New Configuration'}
                                </h4>

                                <div className='grid grid-cols-1 md:grid-cols-2 gap-4 mb-4'>
                                    {/* Provider Selection */}
                                    <div>
                                        <label className='block text-sm font-medium text-white mb-2'>
                                            Provider
                                        </label>
                                        <select
                                            value={selectedProvider}
                                            onChange={e => {
                                                setSelectedProvider(
                                                    e.target.value as AiProvider
                                                );
                                                setSelectedModel('');
                                            }}
                                            className='w-full p-2 bg-gray-800/90 border border-gray-600 rounded-md text-white placeholder-gray-400'
                                        >
                                            {Object.entries(AI_PROVIDERS).map(
                                                ([key, provider]) => (
                                                    <option
                                                        key={key}
                                                        value={key}
                                                    >
                                                        {provider.name}
                                                    </option>
                                                )
                                            )}
                                        </select>
                                    </div>

                                    {/* Model Selection */}
                                    <div>
                                        <label className='block text-sm font-medium text-white mb-2'>
                                            Model
                                        </label>
                                        <select
                                            value={selectedModel}
                                            onChange={e =>
                                                setSelectedModel(e.target.value)
                                            }
                                            className='w-full p-2 bg-gray-800/90 border border-gray-600 rounded-md text-white placeholder-gray-400'
                                        >
                                            <option value=''>
                                                Select a model
                                            </option>
                                            {AI_PROVIDERS[
                                                selectedProvider
                                            ].models.map(model => (
                                                <option
                                                    key={model.id}
                                                    value={model.id}
                                                >
                                                    {model.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* API Key Input */}
                                <div className='mb-4'>
                                    <label className='block text-sm font-medium text-white mb-2'>
                                        API Key
                                    </label>
                                    <div className='flex gap-2'>
                                        <div className='flex-1'>
                                            <Input
                                                type={
                                                    showApiKey
                                                        ? 'text'
                                                        : 'password'
                                                }
                                                value={apiKey}
                                                onChange={e =>
                                                    setApiKey(e.target.value)
                                                }
                                                placeholder='Enter your API key'
                                                className='font-mono text-sm'
                                            />
                                        </div>
                                        <Button
                                            variant='outline'
                                            size='sm'
                                            onClick={() =>
                                                setShowApiKey(!showApiKey)
                                            }
                                            className='px-3'
                                        >
                                            {showApiKey ? '🙈' : '👁️'}
                                        </Button>
                                    </div>
                                </div>

                                {/* Save Configuration */}
                                <div className='flex gap-2'>
                                    <Button
                                        onClick={handleApiConfigSave}
                                        disabled={
                                            !selectedProvider ||
                                            !selectedModel ||
                                            !apiKey.trim() ||
                                            configStatus === 'saving'
                                        }
                                        className='bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700'
                                        size='sm'
                                    >
                                        {configStatus === 'saving'
                                            ? 'Saving...'
                                            : editingConfigId
                                              ? 'Update Configuration'
                                              : 'Save Configuration'}
                                    </Button>
                                    {editingConfigId && (
                                        <Button
                                            onClick={handleConfigCancel}
                                            variant='outline'
                                            size='sm'
                                        >
                                            Cancel
                                        </Button>
                                    )}
                                </div>

                                {configStatus === 'saved' && (
                                    <p className='text-sm text-green-400 mt-2'>
                                        ✓ Configuration saved successfully
                                    </p>
                                )}
                                {configStatus === 'error' && (
                                    <p className='text-sm text-red-400 mt-2'>
                                        ✗ Failed to save configuration
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className='flex flex-col sm:flex-row gap-4 mt-8 pt-6 border-t border-purple-500/30'>
                            {isEditing ? (
                                <>
                                    <Button
                                        onClick={handleSave}
                                        className='bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 flex-1'
                                    >
                                        Save Changes
                                    </Button>
                                    <Button
                                        variant='outline'
                                        onClick={handleCancel}
                                        className='flex-1'
                                    >
                                        Cancel
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <Button
                                        onClick={() => setIsEditing(true)}
                                        className='bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 flex-1'
                                    >
                                        Edit Profile
                                    </Button>
                                    <Button
                                        variant='outline'
                                        onClick={() =>
                                            (window.location.href = '/')
                                        }
                                        className='flex-1 bg-transparent border-purple-400 text-white hover:bg-purple-700/30 hover:text-white'
                                    >
                                        Back to Home
                                    </Button>
                                </>
                            )}
                        </div>

                        {/* Danger Zone */}
                        <div className='mt-8 pt-6 border-t border-purple-500/30'>
                            <h3 className='text-lg font-semibold text-red-400 mb-4'>
                                Danger Zone
                            </h3>
                            <Button
                                variant='destructive'
                                onClick={logout}
                                className='w-full sm:w-auto'
                            >
                                Sign Out
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default ProfilePage;
