import { prisma } from './prisma';
import { hashPassword } from '../utils/password';
import { encryptVMPassword } from '../utils/encryption';
import { UserRole, VmProtocol } from '../shared';

export async function autoSeedDatabase(): Promise<void> {
  try {
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      return; // Database already initialized
    }

    console.log('🌱 Database is empty. Auto-seeding default Admin, Guest user, and sample RDP VM...');

    const adminPasswordHash = await hashPassword('admin123');
    const guestPasswordHash = await hashPassword('guest123');

    const admin = await prisma.user.create({
      data: {
        name: 'System Administrator',
        email: 'admin@example.com',
        username: 'admin',
        passwordHash: adminPasswordHash,
        role: UserRole.ADMIN,
        isActive: true,
      },
    });

    const guest = await prisma.user.create({
      data: {
        name: 'Guest User',
        email: 'guest@example.com',
        username: 'guest',
        passwordHash: guestPasswordHash,
        role: UserRole.USER,
        isActive: true,
      },
    });

    const encryptedVmPass = encryptVMPassword('testpass');
    const sampleVm = await prisma.vM.create({
      data: {
        name: 'Ubuntu RDP Test VM',
        hostname: 'test-rdp',
        port: 3389,
        username: 'testuser',
        encryptedPassword: encryptedVmPass,
        protocol: VmProtocol.RDP,
        description: 'Pre-configured Docker Ubuntu RDP environment',
        isActive: true,
      },
    });

    await prisma.vMUserAssignment.createMany({
      data: [
        { userId: admin.id, vmId: sampleVm.id },
        { userId: guest.id, vmId: sampleVm.id },
      ],
    });

    console.log('✅ Auto-seed complete:');
    console.log('   👑 Admin account: admin / admin123');
    console.log('   👤 Guest account: guest / guest123');
  } catch (error) {
    console.error('❌ Auto-seed failed:', error);
  }
}

