/**
 * app/controllers/admin/dashboard.controller.js
 * Admin Dashboard Controller for Tesnow
 * Provides admin dashboard overview with statistics and recent activity
 * 
 * @module controllers/admin/dashboard.controller
 */

import { getAppConfig } from '../../config/app.config.js';
import { getSeoConfig } from '../../config/seo.config.js';
import { getRequestId, getRequestContext } from '../../core/request-context.js';
import { sendSuccess, sendError } from '../../core/response.js';
import { getLogger, createChildLogger } from '../../core/logger.js';
import { HTTP_STATUS } from '../../core/constants.js';
import { getDbPool } from '../../config/database.config.js';

// ----------------------------------------------------------------------------
// 1. HELPERS
// ----------------------------------------------------------------------------

/**
 * Get safe request ID from context or fallback
 * @param {import('express').Request} req - Express request
 * @returns {string} Request ID
 */
function getRequestIdSafe(req) {
    return getRequestId() || req.id || 'unknown';
}

/**
 * Format date for display
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted date string
 */
function formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toISOString().replace('T', ' ').substring(0, 19);
}

/**
 * Truncate text for display
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
function truncateText(text, maxLength = 100) {
    if (!text || typeof text !== 'string') return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

// ----------------------------------------------------------------------------
// 2. CONTROLLER FACTORY
// ----------------------------------------------------------------------------

/**
 * Factory for creating a dashboard controller with injected dependencies
 * @param {Object} dependencies - Injected dependencies
 * @param {Object} dependencies.dashboardService - Dashboard service (optional)
 * @param {Object} dependencies.postService - Post service (optional)
 * @param {Object} dependencies.userService - User service (optional)
 * @param {Object} dependencies.commentService - Comment service (optional)
 * @param {Object} dependencies.reportService - Report service (optional)
 * @param {Object} dependencies.analyticsService - Analytics service (optional)
 * @param {Object} dependencies.notificationService - Notification service (optional)
 * @param {Object} dependencies.auditService - Audit service (optional)
 * @param {Object} dependencies.featureFlagService - Feature flag service (optional)
 * @param {Function} dependencies.getLogger - Logger getter (optional)
 * @param {Function} dependencies.getRequestId - Request ID getter (optional)
 * @param {Function} dependencies.sendSuccess - Success response helper (optional)
 * @param {Function} dependencies.sendError - Error response helper (optional)
 * @returns {Object} Controller object with handlers
 */
export function createDashboardController(dependencies = {}) {
    const {
        dashboardService = null,
        postService = null,
        userService = null,
        commentService = null,
        reportService = null,
        analyticsService = null,
        notificationService = null,
        auditService = null,
        featureFlagService = null,
        getLogger: injectedGetLogger = null,
        getRequestId: injectedGetRequestId = null,
        sendSuccess: injectedSendSuccess = null,
        sendError: injectedSendError = null,
    } = dependencies;

    // Use injected or fallback to default imports
    const getRequestIdFn = injectedGetRequestId || getRequestId;
    const sendSuccessFn = injectedSendSuccess || sendSuccess;
    const sendErrorFn = injectedSendError || sendError;
    const logger = injectedGetLogger ? injectedGetLogger() : getLogger();
    const log = createChildLogger({ module: 'dashboard-controller' });

    // --------------------------------------------------------------------------
    // HANDLER: GET /admin/dashboard - Admin dashboard
    // --------------------------------------------------------------------------

    /**
     * Render admin dashboard
     * @param {import('express').Request} req - Express request
     * @param {import('express').Response} res - Express response
     * @param {import('express').NextFunction} next - Express next function
     */
    async function index(req, res, next) {
        try {
            const requestId = getRequestIdSafe(req);
            const appConfig = getAppConfig();
            const seoConfig = getSeoConfig();

            // Determine if we should fetch real data or use fallback
            // Check if services are available
            const hasDashboardService = dashboardService && typeof dashboardService.getDashboardData === 'function';
            const hasPostService = postService && typeof postService.getStats === 'function';
            const hasUserService = userService && typeof userService.getStats === 'function';
            const hasCommentService = commentService && typeof commentService.getStats === 'function';
            const hasReportService = reportService && typeof reportService.getStats === 'function';
            const hasAnalyticsService = analyticsService && typeof analyticsService.getSummary === 'function';
            const hasNotificationService = notificationService && typeof notificationService.getRecent === 'function';
            const hasAuditService = auditService && typeof auditService.getRecent === 'function';

            // Build dashboard data
            let dashboardData = {
                stats: {
                    posts: 0,
                    published: 0,
                    drafts: 0,
                    scheduled: 0,
                    trashed: 0,
                    users: 0,
                    comments: 0,
                    pendingComments: 0,
                    reports: 0,
                    pendingReports: 0,
                },
                recentPosts: [],
                recentActivity: [],
                notifications: [],
                updatedAt: new Date().toISOString(),
            };

            // Fetch data from services if available
            try {
                // Dashboard service (if available)
                if (hasDashboardService) {
                    const result = await dashboardService.getDashboardData();
                    if (result) {
                        dashboardData = {
                            ...dashboardData,
                            ...result,
                        };
                    }
                } else {
                    // Fallback: fetch data from individual services
                    // Stats
                    const stats = {};

                    // Post stats
                    if (hasPostService) {
                        try {
                            const postStats = await postService.getStats();
                            if (postStats) {
                                stats.posts = postStats.total || 0;
                                stats.published = postStats.published || 0;
                                stats.drafts = postStats.drafts || 0;
                                stats.scheduled = postStats.scheduled || 0;
                                stats.trashed = postStats.trashed || 0;
                            }
                        } catch (error) {
                            log.warn({ err: error, requestId }, 'Failed to fetch post stats');
                        }
                    }

                    // User stats
                    if (hasUserService) {
                        try {
                            const userStats = await userService.getStats();
                            if (userStats) {
                                stats.users = userStats.total || 0;
                            }
                        } catch (error) {
                            log.warn({ err: error, requestId }, 'Failed to fetch user stats');
                        }
                    }

                    // Comment stats
                    if (hasCommentService) {
                        try {
                            const commentStats = await commentService.getStats();
                            if (commentStats) {
                                stats.comments = commentStats.total || 0;
                                stats.pendingComments = commentStats.pending || 0;
                            }
                        } catch (error) {
                            log.warn({ err: error, requestId }, 'Failed to fetch comment stats');
                        }
                    }

                    // Report stats
                    if (hasReportService) {
                        try {
                            const reportStats = await reportService.getStats();
                            if (reportStats) {
                                stats.reports = reportStats.total || 0;
                                stats.pendingReports = reportStats.pending || 0;
                            }
                        } catch (error) {
                            log.warn({ err: error, requestId }, 'Failed to fetch report stats');
                        }
                    }

                    dashboardData.stats = { ...dashboardData.stats, ...stats };

                    // Recent posts
                    if (hasPostService && typeof postService.getRecent === 'function') {
                        try {
                            const recentPosts = await postService.getRecent(10);
                            if (recentPosts && Array.isArray(recentPosts)) {
                                dashboardData.recentPosts = recentPosts.map(post => ({
                                    id: post.id,
                                    title: post.title || 'Untitled',
                                    slug: post.slug || '',
                                    status: post.status || 'draft',
                                    publishedAt: post.publishedAt || post.createdAt,
                                    author: post.author ? post.author.name : 'Unknown',
                                    excerpt: truncateText(post.excerpt || post.content || '', 120),
                                }));
                            }
                        } catch (error) {
                            log.warn({ err: error, requestId }, 'Failed to fetch recent posts');
                        }
                    }

                    // Notifications
                    if (hasNotificationService) {
                        try {
                            const notifications = await notificationService.getRecent(5);
                            if (notifications && Array.isArray(notifications)) {
                                dashboardData.notifications = notifications.map(notification => ({
                                    id: notification.id,
                                    type: notification.type || 'system',
                                    message: notification.message || '',
                                    read: notification.read || false,
                                    createdAt: notification.createdAt || new Date().toISOString(),
                                }));
                            }
                        } catch (error) {
                            log.warn({ err: error, requestId }, 'Failed to fetch notifications');
                        }
                    }

                    // Recent activity (audit logs)
                    if (hasAuditService) {
                        try {
                            const activities = await auditService.getRecent(10);
                            if (activities && Array.isArray(activities)) {
                                dashboardData.recentActivity = activities.map(activity => ({
                                    id: activity.id,
                                    action: activity.action || '',
                                    resource: activity.resource || '',
                                    actor: activity.actor ? activity.actor.name : 'System',
                                    createdAt: activity.createdAt || new Date().toISOString(),
                                    details: activity.details || {},
                                }));
                            }
                        } catch (error) {
                            log.warn({ err: error, requestId }, 'Failed to fetch audit logs');
                        }
                    }

                    // Analytics summary (if available)
                    if (hasAnalyticsService) {
                        try {
                            const analyticsSummary = await analyticsService.getSummary();
                            if (analyticsSummary) {
                                dashboardData.analytics = analyticsSummary;
                            }
                        } catch (error) {
                            log.warn({ err: error, requestId }, 'Failed to fetch analytics summary');
                        }
                    }
                }
            } catch (error) {
                log.error({ err: error, requestId }, 'Failed to fetch dashboard data');
                // Continue with whatever data we have
            }

            // Update timestamp
            dashboardData.updatedAt = new Date().toISOString();

            // Build view model
            const viewModel = {
                page: {
                    title: `Dashboard${seoConfig.titleSuffix || ''}`,
                    description: 'Admin dashboard overview',
                    canonicalUrl: `${seoConfig.siteUrl || ''}/admin/dashboard`,
                },
                user: req.user || null,
                stats: dashboardData.stats || {},
                recentPosts: dashboardData.recentPosts || [],
                recentActivity: dashboardData.recentActivity || [],
                notifications: dashboardData.notifications || [],
                analytics: dashboardData.analytics || null,
                updatedAt: dashboardData.updatedAt,
                hasAnalytics: !!dashboardData.analytics,
            };

            // Render the dashboard view
            res.status(HTTP_STATUS.OK).render('admin/dashboard/index', viewModel);
        } catch (error) {
            next(error);
        }
    }

    // --------------------------------------------------------------------------
    // RETURN CONTROLLER
    // --------------------------------------------------------------------------

    return {
        index,
    };
}

// ----------------------------------------------------------------------------
// 3. DEFAULT EXPORT
// ----------------------------------------------------------------------------

// Create default controller instance (with no dependencies)
const defaultController = createDashboardController();

export default {
    index: defaultController.index,
    createDashboardController,
};

export const index = defaultController.index;