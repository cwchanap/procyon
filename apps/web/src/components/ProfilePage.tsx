import React, { useState, useEffect } from 'react';
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

    // Load AI configurations from API
    useEffect(() => {
        if (isAuthenticated) {
            fetchConfigurations();
        }
    }, [isAuthenticated]);

    // Set default model when provider changes
    useEffect(() => {
        const models = AI_PROVIDERS[selectedProvider].models;
        if (models.length > 0 && !selectedModel) {
            setSelectedModel(models[0].id);
        }
    }, [selectedProvider, selectedModel]);

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
                'http://localhost:3001/api/ai-config',
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

            const response = await fetch(
                'http://localhost:3001/api/ai-config',
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
                        isActive: configurations.length === 0, // Set as active if it's the first config
                    }),
                }
            );

            if (response.ok) {
                setConfigStatus('saved');
                setApiKey('');
                await fetchConfigurations();
                setTimeout(() => setConfigStatus(null), 3000);
            } else {
                setConfigStatus('error');
                setTimeout(() => setConfigStatus(null), 3000);
            }
        } catch (_error) {
            setConfigStatus('error');
            setTimeout(() => setConfigStatus(null), 3000);
        }
    };

    const handleSetActive = async (provider: AiProvider, modelName: string) => {
        try {
            const token = localStorage.getItem('auth_token');

            const response = await fetch(
                'http://localhost:3001/api/ai-config/set-active',
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        provider,
                        modelName,
                    }),
                }
            );

            if (response.ok) {
                await fetchConfigurations();
            }
        } catch (_error) {
            // Error setting active configuration - continue silently
        }
    };

    const handleDeleteConfig = async (configId: number) => {
        try {
            const token = localStorage.getItem('auth_token');

            const response = await fetch(
                `http://localhost:3001/api/ai-config/${configId}`,
                {
                    method: 'DELETE',
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            if (response.ok) {
                await fetchConfigurations();
            }
        } catch (_error) {
            // Error deleting configuration - continue silently
        }
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
                    <div className='bg-card/80 backdrop-blur-sm rounded-lg border border-border/50 shadow-xl p-8'>
                        {/* Avatar Section */}
                        <div className='text-center mb-8'>
                            <div className='w-24 h-24 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white text-3xl font-bold mx-auto mb-4'>
                                {user.username.charAt(0).toUpperCase()}
                            </div>
                            <h2 className='text-2xl font-semibold text-card-foreground mb-1'>
                                {user.username}
                            </h2>
                            <p className='text-muted-foreground'>
                                {user.email}
                            </p>
                        </div>

                        {/* Profile Information */}
                        <div className='space-y-6'>
                            <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                                {/* Username Field */}
                                <div>
                                    <label className='block text-sm font-medium text-card-foreground mb-2'>
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
                                        <div className='p-3 bg-muted/50 rounded-md text-card-foreground'>
                                            {user.username}
                                        </div>
                                    )}
                                </div>

                                {/* Email Field */}
                                <div>
                                    <label className='block text-sm font-medium text-card-foreground mb-2'>
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
                                        <div className='p-3 bg-muted/50 rounded-md text-card-foreground'>
                                            {user.email}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Account Information */}
                            <div>
                                <label className='block text-sm font-medium text-card-foreground mb-2'>
                                    Member Since
                                </label>
                                <div className='p-3 bg-muted/50 rounded-md text-card-foreground'>
                                    {formatDate(user.createdAt)}
                                </div>
                            </div>

                            <div>
                                <label className='block text-sm font-medium text-card-foreground mb-2'>
                                    User ID
                                </label>
                                <div className='p-3 bg-muted/50 rounded-md text-card-foreground font-mono text-sm'>
                                    {user.id}
                                </div>
                            </div>
                        </div>

                        {/* AI Configuration Section */}
                        <div className='border-t border-border/50 pt-6 mt-6'>
                            <h3 className='text-lg font-semibold text-card-foreground mb-4'>
                                AI Configuration
                            </h3>

                            {/* Add New Configuration */}
                            <div className='mb-6 p-4 bg-muted/30 rounded-lg'>
                                <h4 className='text-md font-medium text-card-foreground mb-3'>
                                    Add New Configuration
                                </h4>

                                <div className='grid grid-cols-1 md:grid-cols-2 gap-4 mb-4'>
                                    {/* Provider Selection */}
                                    <div>
                                        <label className='block text-sm font-medium text-card-foreground mb-2'>
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
                                            className='w-full p-2 bg-background border border-border rounded-md text-card-foreground'
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
                                        <label className='block text-sm font-medium text-card-foreground mb-2'>
                                            Model
                                        </label>
                                        <select
                                            value={selectedModel}
                                            onChange={e =>
                                                setSelectedModel(e.target.value)
                                            }
                                            className='w-full p-2 bg-background border border-border rounded-md text-card-foreground'
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
                                    <label className='block text-sm font-medium text-card-foreground mb-2'>
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
                                            : 'Save Configuration'}
                                    </Button>
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

                            {/* Existing Configurations */}
                            {configurations.length > 0 && (
                                <div>
                                    <h4 className='text-md font-medium text-card-foreground mb-3'>
                                        Saved Configurations
                                    </h4>
                                    <div className='space-y-3'>
                                        {configurations.map((config, index) => {
                                            const provider =
                                                AI_PROVIDERS[config.provider];
                                            const model = provider.models.find(
                                                m => m.id === config.modelName
                                            );

                                            return (
                                                <div
                                                    key={index}
                                                    className='flex items-center justify-between p-3 bg-muted/20 rounded-lg'
                                                >
                                                    <div className='flex-1'>
                                                        <div className='flex items-center gap-2 mb-1'>
                                                            <span className='font-medium text-card-foreground'>
                                                                {provider.name}
                                                            </span>
                                                            <span className='text-sm text-muted-foreground'>
                                                                •{' '}
                                                                {model?.name ||
                                                                    config.modelName}
                                                            </span>
                                                            {config.isActive && (
                                                                <span className='px-2 py-1 text-xs bg-green-600 text-white rounded-full'>
                                                                    Active
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className='text-sm text-muted-foreground font-mono'>
                                                            API Key:{' '}
                                                            {config.apiKey}
                                                        </div>
                                                    </div>
                                                    <div className='flex gap-2'>
                                                        {!config.isActive && (
                                                            <Button
                                                                variant='outline'
                                                                size='sm'
                                                                onClick={() =>
                                                                    handleSetActive(
                                                                        config.provider,
                                                                        config.modelName
                                                                    )
                                                                }
                                                            >
                                                                Set Active
                                                            </Button>
                                                        )}
                                                        <Button
                                                            variant='destructive'
                                                            size='sm'
                                                            onClick={() =>
                                                                config.id &&
                                                                handleDeleteConfig(
                                                                    config.id
                                                                )
                                                            }
                                                        >
                                                            Delete
                                                        </Button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Action Buttons */}
                        <div className='flex flex-col sm:flex-row gap-4 mt-8 pt-6 border-t border-border/50'>
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
                                        className='flex-1'
                                    >
                                        Back to Home
                                    </Button>
                                </>
                            )}
                        </div>

                        {/* Danger Zone */}
                        <div className='mt-8 pt-6 border-t border-border/50'>
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
