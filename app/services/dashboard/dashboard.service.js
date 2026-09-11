/**
 * app/services/dashboard/dashboard.service.js
 *
 * Dashboard Service Layer – aggregates data from multiple repositories
 * to provide a single dashboard data contract.
 *
 * This service is HTTP‑ and Express‑agnostic. It does not access req/res,
 * session, cookies, or authentication. All required context must be passed
 * via the `options` parameter.
 *
 * Privacy‑sensitive data (notifications) is only included when a
 * `notificationUserId` is explicitly provided.
 *
 * Analytics data is only included when an `eventType` is explicitly provided.
 * No hardcoded event type (e.g., "page_view") is used.
 */

// Import default repository instances (lazy singleton with getDbPool())
import postRepository from '../../repositories/post.repository.js';
import userRepository from '../../repositories/user.repository.js';
import commentRepository from '../../repositories/comment.repository.js';
import reportRepository from '../../repositories/report.repository.js';
import analyticsRepository from '../../repositories/analytics.repository.js';
import notificationRepository from '../../repositories/notification.repository.js';
import auditRepository from '../../repositories/audit.repository.js';

// ----------------------------------------------------------------------------
// 1. VALIDATION HELPERS
// ----------------------------------------------------------------------------

/**
 * Validates that a repository object has all required methods.
 * @param {Object} repo - Repository instance.
 * @param {string} name - Repository name for error messages.
 * @param {Array<string>} methods - List of method names that must exist.
 * @throws {Error} If any method is missing or not a function.
 */
function validateRepository(repo, name, methods) {
  if (!repo || typeof repo !== 'object') {
    throw new Error(`Dashboard service: ${name} repository is not provided.`);
  }
  for (const method of methods) {
    if (typeof repo[method] !== 'function') {
      throw new Error(
        `Dashboard service: ${name}.${method}() is not a function.`
      );
    }
  }
}

/**
 * Validates and clamps the recent limit.
 * @param {number} limit - Desired limit.
 * @returns {number} Validated limit (default 10, max 100, non‑negative).
 */
function validateRecentLimit(limit) {
  if (limit === undefined || limit === null) {
    return 10;
  }
  if (!Number.isInteger(limit)) {
    throw new Error('recentLimit must be an integer');
  }
  if (limit < 0) {
    throw new Error('recentLimit cannot be negative');
  }
  return Math.min(limit, 100);
}

/**
 * Validates that a value is a Date object or undefined/null.
 * @param {*} date - Value to check.
 * @param {string} name - Parameter name for error messages.
 * @returns {Date|undefined} The validated Date or undefined.
 * @throws {Error} If date is provided and not a valid Date.
 */
function validateDateParam(date, name) {
  if (date === undefined || date === null) {
    return undefined;
  }
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    throw new Error(`${name} must be a valid Date object`);
  }
  return date;
}

// ----------------------------------------------------------------------------
// 2. FACTORY
// ----------------------------------------------------------------------------

/**
 * Creates a Dashboard Service instance with the given repositories.
 *
 * @param {Object} deps - Repository dependencies.
 * @param {Object} deps.postRepository - Post repository.
 * @param {Object} deps.userRepository - User repository.
 * @param {Object} deps.commentRepository - Comment repository.
 * @param {Object} deps.reportRepository - Report repository.
 * @param {Object} deps.analyticsRepository - Analytics repository.
 * @param {Object} deps.notificationRepository - Notification repository.
 * @param {Object} deps.auditRepository - Audit repository.
 * @returns {Object} Dashboard service with `getDashboardData()` method.
 */
export function createDashboardService({
  postRepository: postRepo = postRepository,
  userRepository: userRepo = userRepository,
  commentRepository: commentRepo = commentRepository,
  reportRepository: reportRepo = reportRepository,
  analyticsRepository: analyticsRepo = analyticsRepository,
  notificationRepository: notificationRepo = notificationRepository,
  auditRepository: auditRepo = auditRepository,
} = {}) {
  // Validate all required repositories and methods.
  validateRepository(postRepo, 'post', [
    'countAll',
    'countByStatus',
    'findRecent',
  ]);
  validateRepository(userRepo, 'user', ['countAll', 'findRecent']);
  validateRepository(commentRepo, 'comment', [
    'countAll',
    'countPending',
    'findRecent',
  ]);
  validateRepository(reportRepo, 'report', ['countAll', 'countPending']);
  validateRepository(analyticsRepo, 'analytics', [
    'countByEventType',
    'countDistinctVisitors',
    'countDistinctSessions',
    'getTrafficByDate',
  ]);
  validateRepository(notificationRepo, 'notification', ['findRecent']);
  validateRepository(auditRepo, 'audit', ['findRecent']);

  // --------------------------------------------------------------------------
  // 3. SERVICE METHOD
  // --------------------------------------------------------------------------

  /**
   * Fetches all dashboard data in parallel and returns a structured object.
   *
   * @param {Object} options - Configuration options.
   * @param {string} [options.eventType] - Required for analytics.
   *    The event type to count (e.g., from application constants).
   *    If omitted, the `analytics` property is not included.
   * @param {Date} [options.startDate] - Inclusive start date for analytics.
   * @param {Date} [options.endDate] - Exclusive end date for analytics.
   * @param {number} [options.notificationUserId] - Required for notifications.
   *    The user ID whose notifications should be fetched.
   *    If omitted, the `notifications` property is not included.
   * @param {number} [options.recentLimit] - Limit for recent lists.
   *    Default 10, clamped to max 100.
   * @returns {Promise<Object>} Dashboard data contract.
   * @throws {Error} Propagates any repository error.
   */
  async function getDashboardData(options = {}) {
    const {
      eventType,
      startDate,
      endDate,
      notificationUserId,
      recentLimit: rawLimit,
    } = options;

    const recentLimit = validateRecentLimit(rawLimit);
    const validatedStartDate = validateDateParam(startDate, 'startDate');
    const validatedEndDate = validateDateParam(endDate, 'endDate');

    // Validate date range: if both are provided, startDate must be < endDate.
    if (validatedStartDate && validatedEndDate && validatedStartDate >= validatedEndDate) {
      throw new Error('startDate must be before endDate');
    }

    // Date range object for analytics repositories.
    const dateRange = {
      startDate: validatedStartDate,
      endDate: validatedEndDate,
    };

    // ------------------------------------------------------------------------
    // 3a. Fetch all domain data in parallel groups
    // ------------------------------------------------------------------------

    // Posts: countAll, countByStatus for each status, and recent.
    const postPromises = {
      total: postRepo.countAll(),
      published: postRepo.countByStatus('published'),
      draft: postRepo.countByStatus('draft'),
      scheduled: postRepo.countByStatus('scheduled'),
      trash: postRepo.countByStatus('trash'),
      recent: postRepo.findRecent({ limit: recentLimit, offset: 0 }),
    };

    // Users: total + recent.
    const userPromises = {
      total: userRepo.countAll(),
      recent: userRepo.findRecent({ limit: recentLimit, offset: 0 }),
    };

    // Comments: total + pending + recent.
    const commentPromises = {
      total: commentRepo.countAll(),
      pending: commentRepo.countPending(),
      recent: commentRepo.findRecent({ limit: recentLimit, offset: 0 }),
    };

    // Reports: total + pending.
    const reportPromises = {
      total: reportRepo.countAll(),
      pending: reportRepo.countPending(),
    };

    // Analytics: only if eventType is explicitly provided (not undefined/null).
    let analyticsPromises = null;
    if (eventType !== undefined && eventType !== null) {
      // Validate that eventType is a non-empty string.
      if (typeof eventType !== 'string' || eventType.trim() === '') {
        throw new Error('eventType must be a non‑empty string if provided');
      }
      analyticsPromises = {
        eventCount: analyticsRepo.countByEventType(eventType, dateRange),
        uniqueVisitors: analyticsRepo.countDistinctVisitors(dateRange),
        uniqueSessions: analyticsRepo.countDistinctSessions(dateRange),
        trafficByDate: analyticsRepo.getTrafficByDate({
          eventType,
          startDate: validatedStartDate,
          endDate: validatedEndDate,
        }),
      };
    }

    // Notifications: only if notificationUserId is provided.
    let notificationPromises = null;
    if (notificationUserId !== undefined && notificationUserId !== null) {
      if (!Number.isInteger(notificationUserId) || notificationUserId <= 0) {
        throw new Error('notificationUserId must be a positive integer');
      }
      notificationPromises = notificationRepo.findRecent({
        userId: notificationUserId,
        limit: recentLimit,
        offset: 0,
      });
    }

    // Audit: always include recent.
    const auditPromises = auditRepo.findRecent({
      limit: recentLimit,
      offset: 0,
    });

    // ------------------------------------------------------------------------
    // 3b. Resolve all promises in parallel
    // ------------------------------------------------------------------------

    const [
      postResults,
      userResults,
      commentResults,
      reportResults,
      auditResults,
      analyticsResults,
      notificationResults,
    ] = await Promise.all([
      // Posts
      Promise.all([
        postPromises.total,
        postPromises.published,
        postPromises.draft,
        postPromises.scheduled,
        postPromises.trash,
        postPromises.recent,
      ]),
      // Users
      Promise.all([userPromises.total, userPromises.recent]),
      // Comments
      Promise.all([
        commentPromises.total,
        commentPromises.pending,
        commentPromises.recent,
      ]),
      // Reports
      Promise.all([reportPromises.total, reportPromises.pending]),
      // Audit
      auditPromises,
      // Analytics (if any)
      analyticsPromises
        ? Promise.all([
            analyticsPromises.eventCount,
            analyticsPromises.uniqueVisitors,
            analyticsPromises.uniqueSessions,
            analyticsPromises.trafficByDate,
          ])
        : Promise.resolve(null),
      // Notifications (if any)
      notificationPromises
        ? notificationPromises
        : Promise.resolve(null),
    ]);

    // ------------------------------------------------------------------------
    // 3c. Build the final dashboard object
    // ------------------------------------------------------------------------

    const dashboard = {
      posts: {
        total: postResults[0],
        published: postResults[1],
        draft: postResults[2],
        scheduled: postResults[3],
        trash: postResults[4],
        recent: postResults[5],
      },
      users: {
        total: userResults[0],
        recent: userResults[1],
      },
      comments: {
        total: commentResults[0],
        pending: commentResults[1],
        recent: commentResults[2],
      },
      reports: {
        total: reportResults[0],
        pending: reportResults[1],
      },
      audit: {
        recent: auditResults,
      },
    };

    // Include analytics only if eventType was provided.
    if (analyticsResults) {
      dashboard.analytics = {
        eventCount: analyticsResults[0],
        uniqueVisitors: analyticsResults[1],
        uniqueSessions: analyticsResults[2],
        trafficByDate: analyticsResults[3],
      };
    }

    // Include notifications only if notificationUserId was provided.
    if (notificationResults) {
      dashboard.notifications = {
        recent: notificationResults,
      };
    }

    return dashboard;
  }

  // --------------------------------------------------------------------------
  // 4. RETURN SERVICE
  // --------------------------------------------------------------------------

  return {
    getDashboardData,
  };
}

// ----------------------------------------------------------------------------
// 5. DEFAULT EXPORT (singleton instance)
// ----------------------------------------------------------------------------

/**
 * Default dashboard service instance, using the default repository
 * instances (which are themselves singleton exports).
 */
const defaultDashboardService = createDashboardService();

export default defaultDashboardService;