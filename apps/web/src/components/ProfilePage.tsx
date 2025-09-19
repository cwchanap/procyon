import React, { useState } from 'react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { useAuth } from '../lib/auth';

export function ProfilePage() {
    const { user, logout, isAuthenticated } = useAuth();
    const [isEditing, setIsEditing] = useState(false);
    const [editedUsername, setEditedUsername] = useState(user?.username || '');
    const [editedEmail, setEditedEmail] = useState(user?.email || '');

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

    const handleSave = () => {
        // TODO: Implement profile update API call
        setIsEditing(false);
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
