import { useAuth } from '../../context/AuthContext';

const AdminConfig = () => {
    const { user } = useAuth();

    return (
        <div>
            <h2 className="text-2xl font-bold sysconfig-heading mb-6">System Configuration</h2>
            <p className="sysconfig-subheading">
                {user?.role === 'distributor'
                    ? `Configuration settings for ${user.displayName}.`
                    : 'Global settings, firmware updates, and data rates.'}
            </p>
        </div>
    );
};

export default AdminConfig;
