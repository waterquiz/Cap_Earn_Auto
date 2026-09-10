// Standalone Mock API Client - Zero external requests to captchakings.com

async function apiRequest(endpoint, method = 'GET', data = null, token = null) {
    return { success: true, valid: true, data: {} };
}

async function login(email, password, machineId) {
    return {
        success: true,
        data: {
            user: {
                id: 'user-uid',
                email: email || 'user@example.com',
                role: 'admin',
                subscription: {
                    status: 'active',
                    expires_at: '2099-12-31T00:00:00Z',
                    panels: 20
                }
            },
            token: 'dev-token'
        }
    };
}

async function register(email, password, machineId, packageType = null) {
    return { success: true };
}

async function verifyToken(token, machineId = null) {
    return {
        success: true,
        valid: true,
        data: {
            user: {
                uid: 'user-uid',
                email: '',
                role: 'admin',
                subscription: {
                    status: 'active',
                    expires_at: '2099-12-31T00:00:00Z',
                    panels: 20
                }
            }
        }
    };
}

async function getSubscription(token) {
    return {
        success: true,
        data: {
            status: 'active',
            expires_at: '2099-12-31T00:00:00Z',
            panels: 20
        }
    };
}

async function syncDailyTask(token) {
    return { success: true };
}

async function updateDailyTask(token, data) {
    return { success: true };
}

async function recordDailyUpload(token) {
    return { success: true };
}

async function getProfile(token) {
    return { success: true, data: { username: 'User' } };
}

async function resetPassword(email) {
    return { success: true };
}

module.exports = {
    login,
    register,
    verifyToken,
    getSubscription,
    syncDailyTask,
    updateDailyTask,
    recordDailyUpload,
    getProfile,
    resetPassword,
    apiRequest
};
